import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";

const AUTH_DIR = path.join(process.cwd(), ".baileys-auth", "test-whatsapp");

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
    try {
      await this.socket?.logout();
    } catch {
      // Reset should still clean up partial or broken auth sessions.
    } finally {
      this.socket?.end?.();
      this.socket = null;
      this.state = "idle";
      this.qrDataUrl = null;
      this.user = null;
      this.lastError = null;
      this.shouldReconnect = false;
      await fs.rm(AUTH_DIR, { force: true, recursive: true });
    }

    return this.getStatus();
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
      browser: baileys.Browsers?.ubuntu?.("Chrome") ?? [
        "Ubuntu",
        "Chrome",
        "22.04.4",
      ],
      markOnlineOnConnect: false,
      syncFullHistory: false,
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

        if (this.shouldReconnect && statusCode !== this.loggedOutCode) {
          setTimeout(() => void this.connect(), 1500);
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
  const result =
    (await baileys.fetchLatestWaWebVersion?.().catch(() => undefined)) ??
    (await baileys.fetchLatestBaileysVersion?.().catch(() => undefined));

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
