import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";

const CONFIG_PATH = "C:\\SLPR\\data\\Local.properties";

const CLIENT_LONG_PASSWORD = 0x00000001;
const CLIENT_LONG_FLAG = 0x00000004;
const CLIENT_CONNECT_WITH_DB = 0x00000008;
const CLIENT_PROTOCOL_41 = 0x00000200;
const CLIENT_SECURE_CONNECTION = 0x00008000;
const CLIENT_MULTI_RESULTS = 0x00020000;
const CLIENT_PLUGIN_AUTH = 0x00080000;

type SlprConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  remoteUrl: string | null;
};

type Packet = {
  sequenceId: number;
  payload: Buffer;
};

function parseProperties(text: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.search(/[:=]/);
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    result[key] = value
      .replace(/\\:/g, ":")
      .replace(/\\\\/g, "\\")
      .replace(/\\=/g, "=")
      .replace(/\\ /g, " ");
  }

  return result;
}

function readConfig(): SlprConfig {
  const config = parseProperties(fs.readFileSync(CONFIG_PATH, "utf8"));
  const port = Number(config.DBPort);

  if (!config.DBHost || !port || !config.DBInstance || !config.DBUserName) {
    throw new Error("SLPR database config is incomplete");
  }

  return {
    host: config.DBHost,
    port,
    database: config.DBInstance,
    user: config.DBUserName,
    password: Buffer.from(config.DBPass || "", "base64").toString("utf8"),
    remoteUrl: config.RemoteUrl || null,
  };
}

export function getSlprRemoteUrl(): string | null {
  return readConfig().remoteUrl;
}

function sha1(data: Buffer): Buffer {
  return crypto.createHash("sha1").update(data).digest();
}

function nativePasswordToken(password: string, seed: Buffer): Buffer {
  if (!password) return Buffer.alloc(0);

  const stage1 = sha1(Buffer.from(password, "utf8"));
  const stage2 = sha1(stage1);
  const stage3 = sha1(Buffer.concat([seed, stage2]));
  const token = Buffer.alloc(stage3.length);

  for (let index = 0; index < stage3.length; index += 1) {
    token[index] = stage3[index] ^ stage1[index];
  }

  return token;
}

function readNullTerminated(buffer: Buffer, offset: number) {
  const end = buffer.indexOf(0x00, offset);
  if (end === -1) {
    return { value: buffer.slice(offset).toString("utf8"), next: buffer.length };
  }
  return { value: buffer.slice(offset, end).toString("utf8"), next: end + 1 };
}

function parseHandshake(buffer: Buffer) {
  let offset = 0;
  offset += 1;

  const version = readNullTerminated(buffer, offset);
  offset = version.next;

  offset += 4;

  const salt1 = buffer.slice(offset, offset + 8);
  offset += 9;

  const capabilityLow = buffer.readUInt16LE(offset);
  offset += 2;

  offset += 1;

  offset += 2;

  const capabilityHigh = buffer.readUInt16LE(offset);
  offset += 2;

  const capabilities = capabilityLow | (capabilityHigh << 16);
  const authPluginLength = buffer[offset] || 21;
  offset += 1;
  offset += 10;

  const salt2Length = Math.max(13, authPluginLength - 8);
  const salt2 = buffer.slice(offset, Math.min(buffer.length, offset + salt2Length));
  offset += salt2.length;

  const plugin = readNullTerminated(buffer, offset);

  return {
    capabilities,
    seed: Buffer.concat([salt1, salt2]).subarray(0, 20),
    pluginName: plugin.value || "mysql_native_password",
  };
}

function createPacket(payload: Buffer, sequenceId: number): Buffer {
  const header = Buffer.alloc(4);
  header.writeUIntLE(payload.length, 0, 3);
  header[3] = sequenceId;
  return Buffer.concat([header, payload]);
}

function createHandshakeResponse(config: SlprConfig, seed: Buffer): Buffer {
  const capabilities =
    CLIENT_LONG_PASSWORD |
    CLIENT_LONG_FLAG |
    CLIENT_CONNECT_WITH_DB |
    CLIENT_PROTOCOL_41 |
    CLIENT_SECURE_CONNECTION |
    CLIENT_MULTI_RESULTS |
    CLIENT_PLUGIN_AUTH;

  const authToken = nativePasswordToken(config.password, seed);
  const fixed = Buffer.alloc(4 + 4 + 1 + 23);
  let offset = 0;

  fixed.writeUInt32LE(capabilities, offset);
  offset += 4;
  fixed.writeUInt32LE(16 * 1024 * 1024, offset);
  offset += 4;
  fixed[offset] = 33;

  return Buffer.concat([
    fixed,
    Buffer.from(`${config.user}\0`, "utf8"),
    Buffer.from([authToken.length]),
    authToken,
    Buffer.from(`${config.database}\0`, "utf8"),
    Buffer.from("mysql_native_password\0", "utf8"),
  ]);
}

function parseErrorPacket(payload: Buffer): Error | null {
  if (payload[0] !== 0xff) return null;

  const errno = payload.readUInt16LE(1);
  const sqlState = payload[3] === 0x23 ? payload.slice(4, 9).toString("utf8") : "";
  const messageOffset = payload[3] === 0x23 ? 9 : 3;
  const message = payload.slice(messageOffset).toString("utf8");

  return new Error(`SLPR MySQL error ${errno} ${sqlState}: ${message}`);
}

function readLengthEncodedInteger(buffer: Buffer, offset: number) {
  const first = buffer[offset];
  if (first < 0xfb) return { value: first, next: offset + 1 };
  if (first === 0xfc) return { value: buffer.readUInt16LE(offset + 1), next: offset + 3 };
  if (first === 0xfd) return { value: buffer.readUIntLE(offset + 1, 3), next: offset + 4 };
  if (first === 0xfe) return { value: Number(buffer.readBigUInt64LE(offset + 1)), next: offset + 9 };
  return { value: null, next: offset + 1 };
}

function readLengthEncodedString(buffer: Buffer, offset: number) {
  const length = readLengthEncodedInteger(buffer, offset);
  if (length.value === null) return { value: null, next: length.next };

  const start = length.next;
  const end = start + length.value;
  return {
    value: buffer.slice(start, end).toString("utf8"),
    next: end,
  };
}

class MySqlConnection {
  private socket: net.Socket | null = null;
  private buffer = Buffer.alloc(0);
  private waiters: Array<{
    resolve: (packet: Packet) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(private config: SlprConfig) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({
        host: this.config.host,
        port: this.config.port,
      });
      this.socket.setTimeout(5000);
      this.socket.once("connect", resolve);
      this.socket.once("error", reject);
      this.socket.on("timeout", () => {
        this.close();
        reject(new Error("Timed out connecting to SLPR database"));
      });
      this.socket.on("data", (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.flushWaiters();
      });
    });
  }

  close() {
    this.socket?.destroy();
    this.socket = null;
  }

  writePacket(payload: Buffer, sequenceId: number) {
    this.socket?.write(createPacket(payload, sequenceId));
  }

  readPacket(timeoutMs = 5000): Promise<Packet> {
    const packet = this.tryReadPacket();
    if (packet) return Promise.resolve(packet);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.resolve !== resolve);
        reject(new Error("Timed out waiting for SLPR database"));
      }, timeoutMs);

      this.waiters.push({
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
  }

  private flushWaiters() {
    while (this.waiters.length > 0) {
      const packet = this.tryReadPacket();
      if (!packet) return;
      this.waiters.shift()?.resolve(packet);
    }
  }

  private tryReadPacket(): Packet | null {
    if (this.buffer.length < 4) return null;

    const length = this.buffer.readUIntLE(0, 3);
    if (this.buffer.length < 4 + length) return null;

    const sequenceId = this.buffer[3];
    const payload = this.buffer.slice(4, 4 + length);
    this.buffer = this.buffer.slice(4 + length);

    return { sequenceId, payload };
  }
}

async function login(connection: MySqlConnection, config: SlprConfig) {
  const handshakePacket = await connection.readPacket();
  const handshake = parseHandshake(handshakePacket.payload);
  if (handshake.pluginName && handshake.pluginName !== "mysql_native_password") {
    throw new Error(`Unsupported SLPR auth plugin: ${handshake.pluginName}`);
  }

  connection.writePacket(createHandshakeResponse(config, handshake.seed), 1);
  const loginPacket = await connection.readPacket();
  const loginError = parseErrorPacket(loginPacket.payload);
  if (loginError) throw loginError;
}

async function query<T extends Record<string, string | null>>(
  connection: MySqlConnection,
  sql: string
): Promise<T[]> {
  connection.writePacket(Buffer.concat([Buffer.from([0x03]), Buffer.from(sql, "utf8")]), 0);

  const first = await connection.readPacket();
  const firstError = parseErrorPacket(first.payload);
  if (firstError) throw firstError;

  const columnCount = readLengthEncodedInteger(first.payload, 0).value;
  if (columnCount === null) return [];

  const columns: string[] = [];
  for (let index = 0; index < columnCount; index += 1) {
    const columnPacket = await connection.readPacket();
    let offset = 0;
    const parts: Array<string | null> = [];

    for (let part = 0; part < 6; part += 1) {
      const parsed = readLengthEncodedString(columnPacket.payload, offset);
      parts.push(parsed.value);
      offset = parsed.next;
    }

    columns.push(parts[4] || parts[5] || `column_${index + 1}`);
  }

  await connection.readPacket();

  const rows: T[] = [];
  while (true) {
    const rowPacket = await connection.readPacket();
    if (rowPacket.payload[0] === 0xfe && rowPacket.payload.length < 9) break;

    let offset = 0;
    const row: Record<string, string | null> = {};
    for (const column of columns) {
      const parsed = readLengthEncodedString(rowPacket.payload, offset);
      row[column] = parsed.value;
      offset = parsed.next;
    }
    rows.push(row as T);
  }

  return rows;
}

export async function querySlpr<T extends Record<string, string | null>>(
  sql: string
): Promise<T[]> {
  const config = readConfig();
  const connection = new MySqlConnection(config);

  try {
    await connection.connect();
    await login(connection, config);
    return await query<T>(connection, sql);
  } finally {
    connection.close();
  }
}
