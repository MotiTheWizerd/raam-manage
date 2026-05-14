import fs from "node:fs/promises";
import path from "node:path";

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

type BaileysSocket = {
  ev: {
    on(event: "connection.update", callback: (update: ConnectionUpdate) => void): void;
    on(event: "creds.update", callback: () => void | Promise<void>): void;
  };
  sendMessage(jid: string, content: { text: string }): Promise<unknown>;
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

    const jid = `${normalizePhone(phone)}@s.whatsapp.net`;
    await this.socket.sendMessage(jid, { text });
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

    return this.getStatus();
  }
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

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) throw new Error("Phone number is required.");

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
