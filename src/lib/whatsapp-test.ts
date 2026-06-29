import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";

// Keep prod (:3000 pm2 build, NODE_ENV=production) and dev (:3001 `next dev`)
// on SEPARATE auth folders = separate WhatsApp linked-device slots, so working
// on the dev server never kicks the live prod session offline (and vice-versa).
const AUTH_DIR = path.join(
  process.cwd(),
  ".baileys-auth",
  process.env.NODE_ENV === "production" ? "test-whatsapp" : "test-whatsapp-dev"
);

type ConnectionState = "idle" | "connecting" | "qr" | "connected" | "closed";

export type WhatsAppTestStatus = {
  state: ConnectionState;
  qrDataUrl: string | null;
  user: string | null;
  lastError: string | null;
};

type ConnectionUpdate = {
  connection?: "connecting" | "open" | "close";
  qr?: string;
  isNewLogin?: boolean;
  lastDisconnect?: {
    error?: {
      output?: {
        statusCode?: number;
      };
      data?: unknown;
      message?: string;
    };
  };
};

type BaileysMessageKey = {
  remoteJid?: string | null;
  fromMe?: boolean | null;
  id?: string | null;
};

type BaileysMessageContent = {
  conversation?: string | null;
  extendedTextMessage?: { text?: string | null } | null;
  ephemeralMessage?: { message?: BaileysMessageContent } | null;
  viewOnceMessage?: { message?: BaileysMessageContent } | null;
  viewOnceMessageV2?: { message?: BaileysMessageContent } | null;
  imageMessage?: { caption?: string | null } | null;
  videoMessage?: { caption?: string | null } | null;
} | null;

type BaileysMessage = {
  key: BaileysMessageKey;
  message?: BaileysMessageContent;
};

type BaileysMessageUpdate = {
  key: BaileysMessageKey;
  update: { status?: number };
};

type BaileysSocket = {
  ev: {
    on(event: "connection.update", callback: (update: ConnectionUpdate) => void): void;
    on(event: "creds.update", callback: () => void | Promise<void>): void;
    on(
      event: "messages.upsert",
      callback: (arg: { messages: BaileysMessage[]; type?: string }) => void
    ): void;
    on(event: "messages.update", callback: (updates: BaileysMessageUpdate[]) => void): void;
  };
  sendMessage(
    jid: string,
    content: { text: string }
  ): Promise<{ key?: BaileysMessageKey } | undefined>;
  logout(): Promise<void>;
  end?: (error?: Error) => void;
  user?: {
    id?: string;
    name?: string;
  };
};

type BaileysModule = {
  default?: (config: Record<string, unknown>) => BaileysSocket;
  makeWASocket?: (config: Record<string, unknown>) => BaileysSocket;
  useMultiFileAuthState: (
    folder: string
  ) => Promise<{ state: unknown; saveCreds: () => void | Promise<void> }>;
  fetchLatestWaWebVersion?: () => Promise<{ version: number[]; isLatest: boolean }>;
  fetchLatestBaileysVersion?: () => Promise<{ version: number[]; isLatest: boolean }>;
  Browsers?: {
    ubuntu?: (browser: string) => string[];
    macOS?: (browser: string) => string[];
  };
  DisconnectReason?: {
    loggedOut?: number;
  };
};

type QrCodeModule = {
  toDataURL: (text: string, options?: Record<string, unknown>) => Promise<string>;
};

type PersistedStatus = "pending" | "sent" | "delivered" | "read" | "failed";

const FORWARD_RANK: Record<"pending" | "sent" | "delivered" | "read", number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

class WhatsAppTestRuntime {
  private socket: BaileysSocket | null = null;
  private connectPromise: Promise<WhatsAppTestStatus> | null = null;
  private state: ConnectionState = "idle";
  private qrDataUrl: string | null = null;
  private user: string | null = null;
  private lastError: string | null = null;
  private loggedOutCode: number | undefined;
  private shouldReconnect = false;
  /** Backoff state for auto-reconnect (reset to 0 on a successful open). */
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  getStatus(): WhatsAppTestStatus {
    return {
      state: this.state,
      qrDataUrl: this.qrDataUrl,
      user: this.user,
      lastError: this.lastError,
    };
  }

  async connect(): Promise<WhatsAppTestStatus> {
    if (this.socket && this.state !== "closed") return this.getStatus();
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.createSocket();

    try {
      return await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  /**
   * Boot helper: reconnect on server start ONLY if we already have linked creds
   * on disk, so a pm2 restart / nightly reboot restores the session without
   * anyone re-scanning a QR. No creds → stay idle (never spawn a QR nobody
   * will scan).
   */
  async connectIfLinked(): Promise<void> {
    try {
      await fs.access(path.join(AUTH_DIR, "creds.json"));
    } catch {
      return; // not linked yet
    }
    this.shouldReconnect = true;
    try {
      await this.connect();
    } catch {
      this.scheduleReconnect();
    }
  }

  async sendText(phone: string, text: string): Promise<void> {
    if (this.state !== "connected" || !this.socket) {
      throw new Error("WhatsApp is not connected yet.");
    }

    const normalized = normalizePhone(phone);
    const jid = `${normalized}@s.whatsapp.net`;
    const residentId = findResidentByPhone(normalized);

    const inserted = db
      .prepare(
        `INSERT INTO whatsapp_messages (resident_id, phone, direction, body, status)
         VALUES (?, ?, 'out', ?, 'pending') RETURNING id`
      )
      .get(residentId, normalized, text) as { id: number };

    try {
      const result = await this.socket.sendMessage(jid, { text });
      const waId = result?.key?.id ?? null;
      db.prepare(
        `UPDATE whatsapp_messages
            SET status = 'sent',
                wa_message_id = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`
      ).run(waId, inserted.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send message.";
      db.prepare(
        `UPDATE whatsapp_messages
            SET status = 'failed',
                error = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`
      ).run(message, inserted.id);
      throw error;
    }
  }

  async logout(): Promise<WhatsAppTestStatus> {
    // Stop any pending reconnect from re-creating a socket mid-reset.
    this.shouldReconnect = false;
    try {
      // socket.logout() does a network round-trip; on a dead/broken socket it
      // can hang forever (the old logout-hang bug), so cap it — we reset and
      // wipe the on-disk creds regardless of the result.
      if (this.socket) await withTimeout(this.socket.logout(), 4000);
    } catch {
      // Reset should still clean up partial or broken auth sessions.
    } finally {
      this.socket?.end?.();
      this.resetRuntime();
      await this.purgeAuth();
    }

    return this.getStatus();
  }

  /** Wipe the on-disk auth folder. Never throws (missing dir is fine). */
  private async purgeAuth(): Promise<void> {
    await fs.rm(AUTH_DIR, { force: true, recursive: true }).catch(() => {});
  }

  /** Reset in-memory connection state back to a clean, disconnected slate. */
  private resetRuntime(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.socket = null;
    this.state = "idle";
    this.qrDataUrl = null;
    this.user = null;
    this.lastError = null;
    this.shouldReconnect = false;
  }

  /**
   * Auto-reconnect with exponential backoff (1.5s → 3s → 6s … capped at 30s).
   * Unlike a one-shot retry, a transient failure mid-reconnect just backs off
   * and tries again instead of leaving the socket permanently dead. Backoff
   * resets to 0 once the connection actually opens.
   */
  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) return; // already queued

    const delay = Math.min(1500 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => {
        // connect() itself threw (network blip, version fetch, …) — keep trying.
        if (this.shouldReconnect) this.scheduleReconnect();
      });
    }, delay);
  }

  /**
   * Status codes where the stored credentials are DEAD — replaying them just
   * loops (the 401 "Connection Failure" that kept getting stuck). The device
   * was unlinked (401 loggedOut), rejected (403 forbidden) or the session is
   * corrupt (500 badSession). In all three the creds on disk must be purged.
   */
  private isDeadCredsCode(code: number): boolean {
    const loggedOut = this.loggedOutCode ?? 401;
    return code === loggedOut || code === 403 || code === 500;
  }

  private async createSocket(): Promise<WhatsAppTestStatus> {
    this.state = "connecting";
    this.qrDataUrl = null;
    this.lastError = null;

    const baileys = (await import("baileys")) as BaileysModule;
    const qrcode = (await import("qrcode")) as QrCodeModule;
    const makeSocket = baileys.default ?? baileys.makeWASocket;

    if (!makeSocket) {
      throw new Error("Baileys did not expose makeWASocket.");
    }

    this.loggedOutCode = baileys.DisconnectReason?.loggedOut;

    const { state, saveCreds } = await baileys.useMultiFileAuthState(AUTH_DIR);
    const version = await getLatestVersion(baileys);
    const socket = makeSocket({
      auth: state,
      version,
      // Label shown in the phone's "Linked Devices" list (platform, browser,
      // version) — purely cosmetic, decoupled from the real host OS. Set to our
      // system name so it's instantly recognizable instead of a generic "Ubuntu".
      browser: ["רעם ביטחון (בוטיק)", "Chrome", "1.0"],
      markOnlineOnConnect: false,
      syncFullHistory: false,
      // Stability tuning: ping a bit more often so dead links are caught and
      // NAT/firewall mappings stay warm; give slow networks longer to finish
      // the handshake before aborting; back off request retries slightly.
      keepAliveIntervalMs: 25_000,
      connectTimeoutMs: 60_000,
      retryRequestDelayMs: 1_000,
    });

    this.socket = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", async (update) => {
      if (update.qr) {
        this.state = "qr";
        this.qrDataUrl = await qrcode.toDataURL(update.qr, {
          margin: 1,
          width: 280,
        });
      }

      if (update.connection === "connecting") {
        this.state = this.qrDataUrl ? "qr" : "connecting";
      }

      if (update.connection === "open") {
        this.state = "connected";
        this.qrDataUrl = null;
        this.lastError = null;
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        this.user = socket.user?.name ?? socket.user?.id ?? "connected";
      }

      if (update.isNewLogin) {
        this.shouldReconnect = true;
      }

      if (update.connection === "close") {
        const statusCode = update.lastDisconnect?.error?.output?.statusCode;
        this.socket = null;
        this.state = "closed";
        this.qrDataUrl = null;
        this.lastError = formatDisconnectError(update);

        if (statusCode !== undefined && this.isDeadCredsCode(statusCode)) {
          // The linked device is dead (401/403/500). Purge the on-disk creds
          // NOW so the next connect generates a fresh QR instead of replaying
          // them into an endless 401 loop. Keep lastError so the UI explains
          // why; drop to "idle" since there's no session to resume anymore.
          this.shouldReconnect = false;
          await this.purgeAuth();
          this.state = "idle";
        } else if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      }
    });

    socket.ev.on("messages.upsert", ({ messages, type }) => {
      console.log(
        "[whatsapp] messages.upsert",
        type,
        messages.map((m) => ({
          fromMe: m.key.fromMe,
          remoteJid: m.key.remoteJid,
          id: m.key.id,
          messageKeys: m.message ? Object.keys(m.message) : null,
        }))
      );
      if (type && type !== "notify") return;
      for (const msg of messages) {
        try {
          recordInboundMessage(msg);
        } catch (err) {
          console.warn("[whatsapp] recordInboundMessage failed", err);
        }
      }
    });

    socket.ev.on("messages.update", (updates) => {
      for (const u of updates) {
        try {
          applyReceiptUpdate(u);
        } catch {
          // Same as above.
        }
      }
    });

    return this.getStatus();
  }
}

function recordInboundMessage(msg: BaileysMessage): void {
  if (msg.key.fromMe) return;
  const remoteJid = msg.key.remoteJid ?? "";
  if (!remoteJid.endsWith("@s.whatsapp.net")) return; // skip groups + status
  const rawPhone = remoteJid.split("@")[0];
  const phone = digitsOnly(rawPhone);
  if (!phone) return;

  const body = extractText(msg.message);
  if (!body) {
    console.log("[whatsapp] inbound message had no extractable text", {
      remoteJid,
      messageKeys: msg.message ? Object.keys(msg.message) : null,
    });
    return;
  }

  const waId = msg.key.id ?? null;
  const residentId = findResidentByPhone(phone);

  db.prepare(
    `INSERT INTO whatsapp_messages
       (resident_id, phone, direction, body, status, wa_message_id)
     VALUES (?, ?, 'in', ?, 'delivered', ?)`
  ).run(residentId, phone, body, waId);

  console.log("[whatsapp] inbound recorded", { phone, residentId, body });
}

function extractText(content: BaileysMessageContent | undefined): string {
  if (!content) return "";
  if (content.conversation) return content.conversation;
  if (content.extendedTextMessage?.text) return content.extendedTextMessage.text;
  if (content.ephemeralMessage?.message)
    return extractText(content.ephemeralMessage.message);
  if (content.viewOnceMessage?.message)
    return extractText(content.viewOnceMessage.message);
  if (content.viewOnceMessageV2?.message)
    return extractText(content.viewOnceMessageV2.message);
  if (content.imageMessage?.caption) return content.imageMessage.caption;
  if (content.videoMessage?.caption) return content.videoMessage.caption;
  return "";
}

function applyReceiptUpdate(u: BaileysMessageUpdate): void {
  if (!u.key.fromMe) return;
  const waId = u.key.id;
  const code = u.update.status;
  if (!waId || code === undefined) return;

  const mapped = mapReceiptStatus(code);
  if (!mapped) return;

  const current = db
    .prepare(`SELECT status FROM whatsapp_messages WHERE wa_message_id = ?`)
    .get(waId) as { status: PersistedStatus } | undefined;
  if (!current) return;
  if (current.status === "failed" || current.status === "read") return;

  const currentRank = FORWARD_RANK[current.status as keyof typeof FORWARD_RANK];
  const nextRank = FORWARD_RANK[mapped];
  if (currentRank !== undefined && nextRank <= currentRank) return;

  db.prepare(
    `UPDATE whatsapp_messages
        SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE wa_message_id = ?`
  ).run(mapped, waId);
}

function mapReceiptStatus(
  code: number
): "sent" | "delivered" | "read" | null {
  // Baileys WAMessageStatus enum: 0=ERROR, 1=PENDING, 2=SERVER_ACK,
  // 3=DELIVERY_ACK, 4=READ, 5=PLAYED. We collapse 4 and 5 to 'read'.
  if (code === 2) return "sent";
  if (code === 3) return "delivered";
  if (code === 4 || code === 5) return "read";
  return null;
}

function findResidentByPhone(normalized: string): number | null {
  const rows = db
    .prepare(`SELECT resident_id, number FROM phones`)
    .all() as { resident_id: number; number: string }[];

  const tail = normalized.slice(-9); // last 9 digits — robust against 0/+972 prefixes
  for (const row of rows) {
    const candidate = digitsOnly(row.number).slice(-9);
    if (candidate && candidate === tail) return row.resident_id;
  }
  return null;
}

async function getLatestVersion(baileys: BaileysModule): Promise<number[] | undefined> {
  // Prefer the version Baileys was TESTED against (fetchLatestBaileysVersion)
  // over the bleeding-edge WA Web version — forcing a protocol version newer
  // than this Baileys build supports causes handshake/stream failures and
  // frequent drops. WA Web version stays only as a fallback.
  const result =
    (await baileys.fetchLatestBaileysVersion?.().catch(() => undefined)) ??
    (await baileys.fetchLatestWaWebVersion?.().catch(() => undefined));

  return result?.version;
}

function formatDisconnectError(update: ConnectionUpdate): string {
  const error = update.lastDisconnect?.error;
  const statusCode = error?.output?.statusCode;
  const data = error?.data;
  const details =
    data && typeof data === "object" ? ` ${JSON.stringify(data)}` : "";
  const code = statusCode ? ` (${statusCode})` : "";

  return `${error?.message ?? "WhatsApp connection closed."}${code}${details}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("operation timed out")), ms)
    ),
  ]);
}

function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

function normalizePhone(phone: string): string {
  const digits = digitsOnly(phone);
  if (!digits) throw new Error("Phone number is required.");

  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0") && digits.length >= 9) return `972${digits.slice(1)}`;

  return digits;
}

export function normalizePhoneOrNull(phone: string): string | null {
  const digits = digitsOnly(phone);
  if (!digits) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0") && digits.length >= 9) return `972${digits.slice(1)}`;
  return digits;
}

type WhatsAppTestGlobal = typeof globalThis & {
  __raamWhatsAppTest?: WhatsAppTestRuntime;
};

const sharedGlobal = globalThis as WhatsAppTestGlobal;

export const whatsappTest =
  sharedGlobal.__raamWhatsAppTest ?? new WhatsAppTestRuntime();

sharedGlobal.__raamWhatsAppTest = whatsappTest;
