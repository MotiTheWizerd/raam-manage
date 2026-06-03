import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";

const DEFAULT_CONFIG_PATHS = [
  "C:\\SLPR\\data\\Local.properties",
  "C:\\SLPR\\data\\SLPR.properties",
];

const configPaths = process.argv.slice(2);
const pathsToTry = configPaths.length > 0 ? configPaths : DEFAULT_CONFIG_PATHS;

const CLIENT_LONG_PASSWORD = 0x00000001;
const CLIENT_LONG_FLAG = 0x00000004;
const CLIENT_CONNECT_WITH_DB = 0x00000008;
const CLIENT_PROTOCOL_41 = 0x00000200;
const CLIENT_SECURE_CONNECTION = 0x00008000;
const CLIENT_MULTI_RESULTS = 0x00020000;
const CLIENT_PLUGIN_AUTH = 0x00080000;

function parseProperties(text) {
  const result = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.search(/[:=]/);
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    result[key] = unescapeJavaProperties(value);
  }

  return result;
}

function unescapeJavaProperties(value) {
  return value
    .replace(/\\:/g, ":")
    .replace(/\\\\/g, "\\")
    .replace(/\\=/g, "=")
    .replace(/\\ /g, " ");
}

function decodePassword(value) {
  return Buffer.from(value || "", "base64").toString("utf8");
}

function mask(value) {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-2)}`;
}

function sha1(data) {
  return crypto.createHash("sha1").update(data).digest();
}

function nativePasswordToken(password, seed) {
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

function readNullTerminated(buffer, offset) {
  const end = buffer.indexOf(0x00, offset);
  if (end === -1) return { value: buffer.slice(offset).toString("utf8"), next: buffer.length };
  return { value: buffer.slice(offset, end).toString("utf8"), next: end + 1 };
}

function parseHandshake(buffer) {
  let offset = 0;
  const protocol = buffer[offset];
  offset += 1;

  const version = readNullTerminated(buffer, offset);
  offset = version.next;

  const connectionId = buffer.readUInt32LE(offset);
  offset += 4;

  const salt1 = buffer.slice(offset, offset + 8);
  offset += 9;

  const capabilityLow = buffer.readUInt16LE(offset);
  offset += 2;

  const charset = buffer[offset];
  offset += 1;

  const statusFlags = buffer.readUInt16LE(offset);
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
    protocol,
    serverVersion: version.value,
    connectionId,
    charset,
    statusFlags,
    capabilities,
    seed: Buffer.concat([salt1, salt2]).subarray(0, 20),
    pluginName: plugin.value || "mysql_native_password",
  };
}

function createPacket(payload, sequenceId) {
  const header = Buffer.alloc(4);
  header.writeUIntLE(payload.length, 0, 3);
  header[3] = sequenceId;
  return Buffer.concat([header, payload]);
}

function createHandshakeResponse({ user, password, database, seed }) {
  const capabilities =
    CLIENT_LONG_PASSWORD |
    CLIENT_LONG_FLAG |
    CLIENT_CONNECT_WITH_DB |
    CLIENT_PROTOCOL_41 |
    CLIENT_SECURE_CONNECTION |
    CLIENT_MULTI_RESULTS |
    CLIENT_PLUGIN_AUTH;

  const authToken = nativePasswordToken(password, seed);
  const fixed = Buffer.alloc(4 + 4 + 1 + 23);
  let offset = 0;

  fixed.writeUInt32LE(capabilities, offset);
  offset += 4;
  fixed.writeUInt32LE(16 * 1024 * 1024, offset);
  offset += 4;
  fixed[offset] = 33;

  return Buffer.concat([
    fixed,
    Buffer.from(`${user}\0`, "utf8"),
    Buffer.from([authToken.length]),
    authToken,
    Buffer.from(`${database}\0`, "utf8"),
    Buffer.from("mysql_native_password\0", "utf8"),
  ]);
}

function parseErrorPacket(payload) {
  if (payload[0] !== 0xff) return null;
  const errno = payload.readUInt16LE(1);
  const sqlState = payload[3] === 0x23 ? payload.slice(4, 9).toString("utf8") : "";
  const messageOffset = payload[3] === 0x23 ? 9 : 3;
  return {
    errno,
    sqlState,
    message: payload.slice(messageOffset).toString("utf8"),
  };
}

function readLengthEncodedInteger(buffer, offset) {
  const first = buffer[offset];
  if (first < 0xfb) return { value: first, next: offset + 1 };
  if (first === 0xfc) return { value: buffer.readUInt16LE(offset + 1), next: offset + 3 };
  if (first === 0xfd) return { value: buffer.readUIntLE(offset + 1, 3), next: offset + 4 };
  if (first === 0xfe) return { value: Number(buffer.readBigUInt64LE(offset + 1)), next: offset + 9 };
  return { value: null, next: offset + 1 };
}

function readLengthEncodedString(buffer, offset) {
  const length = readLengthEncodedInteger(buffer, offset);
  if (length.value === null) return { value: null, next: length.next };

  const start = length.next;
  const end = start + length.value;
  return {
    value: buffer.slice(start, end).toString("utf8"),
    next: end,
  };
}

class MySqlSocket {
  constructor(host, port) {
    this.host = host;
    this.port = port;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host: this.host, port: this.port });
      this.socket.once("connect", resolve);
      this.socket.once("error", reject);
      this.socket.on("data", (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.flushWaiters();
      });
    });
  }

  close() {
    this.socket?.destroy();
  }

  writePacket(payload, sequenceId) {
    this.socket.write(createPacket(payload, sequenceId));
  }

  readPacket(timeoutMs = 5000) {
    const packet = this.tryReadPacket();
    if (packet) return Promise.resolve(packet);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.resolve !== resolve);
        reject(new Error("Timed out waiting for MySQL packet"));
      }, timeoutMs);

      this.waiters.push({
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
      });
    });
  }

  flushWaiters() {
    while (this.waiters.length > 0) {
      const packet = this.tryReadPacket();
      if (!packet) return;
      this.waiters.shift().resolve(packet);
    }
  }

  tryReadPacket() {
    if (this.buffer.length < 4) return null;

    const length = this.buffer.readUIntLE(0, 3);
    if (this.buffer.length < 4 + length) return null;

    const sequenceId = this.buffer[3];
    const payload = this.buffer.slice(4, 4 + length);
    this.buffer = this.buffer.slice(4 + length);

    return { sequenceId, payload };
  }
}

async function query(connection, sql) {
  connection.writePacket(Buffer.concat([Buffer.from([0x03]), Buffer.from(sql, "utf8")]), 0);

  const first = await connection.readPacket();
  const error = parseErrorPacket(first.payload);
  if (error) throw new Error(`${error.errno} ${error.sqlState} ${error.message}`);

  const columnCount = readLengthEncodedInteger(first.payload, 0).value;
  const columns = [];

  for (let index = 0; index < columnCount; index += 1) {
    const columnPacket = await connection.readPacket();
    let offset = 0;
    const parts = [];

    for (let part = 0; part < 6; part += 1) {
      const parsed = readLengthEncodedString(columnPacket.payload, offset);
      parts.push(parsed.value);
      offset = parsed.next;
    }

    columns.push(parts[4] || parts[5] || `column_${index + 1}`);
  }

  await connection.readPacket();

  const rows = [];
  while (true) {
    const rowPacket = await connection.readPacket();
    if (rowPacket.payload[0] === 0xfe && rowPacket.payload.length < 9) break;

    let offset = 0;
    const row = {};
    for (const column of columns) {
      const parsed = readLengthEncodedString(rowPacket.payload, offset);
      row[column] = parsed.value;
      offset = parsed.next;
    }
    rows.push(row);
  }

  return rows;
}

async function testConfig(path) {
  const config = parseProperties(fs.readFileSync(path, "utf8"));
  const host = config.DBHost;
  const port = Number(config.DBPort);
  const database = config.DBInstance;
  const user = config.DBUserName;
  const password = decodePassword(config.DBPass);

  console.log(`\nTesting ${path}`);
  console.log(`Target: ${user}@${host}:${port}/${database}`);
  console.log(`Password: ${mask(password)}`);

  const connection = new MySqlSocket(host, port);

  try {
    await connection.connect();
    const handshakePacket = await connection.readPacket();
    const handshake = parseHandshake(handshakePacket.payload);
    console.log(`Server: ${handshake.serverVersion}`);
    console.log(`Auth plugin: ${handshake.pluginName}`);

    connection.writePacket(createHandshakeResponse({ user, password, database, seed: handshake.seed }), 1);
    const loginPacket = await connection.readPacket();
    const loginError = parseErrorPacket(loginPacket.payload);
    if (loginError) {
      console.log(`Login failed: ${loginError.errno} ${loginError.sqlState} ${loginError.message}`);
      return false;
    }

    console.log("Login succeeded.");

    const versionRows = await query(connection, "SELECT DATABASE() AS db_name, VERSION() AS db_version");
    console.table(versionRows);

    const tableRows = await query(
      connection,
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
    );

    console.log(`Tables found: ${tableRows.length}`);
    for (const row of tableRows.slice(0, 80)) {
      console.log(`- ${row.TABLE_NAME}`);
    }

    if (tableRows.length > 80) {
      console.log(`...and ${tableRows.length - 80} more`);
    }

    const interestingTables = ["eventlog", "lp_match", "images", "log"];
    for (const tableName of interestingTables) {
      if (!tableRows.some((row) => row.TABLE_NAME === tableName)) continue;

      console.log(`\nColumns: ${tableName}`);
      const columnRows = await query(connection, `SHOW COLUMNS FROM \`${tableName}\``);
      console.table(columnRows);
    }

    console.log("\nRecent eventlog rows");
    const eventRows = await query(connection, "SELECT * FROM `eventlog` ORDER BY 1 DESC LIMIT 20");
    console.table(eventRows);

    console.log("\nRecent log rows");
    const logRows = await query(connection, "SELECT * FROM `log` ORDER BY `LOG_DATE` DESC, `ID` DESC LIMIT 30");
    console.table(logRows);

    return true;
  } finally {
    connection.close();
  }
}

for (const path of pathsToTry) {
  if (!fs.existsSync(path)) {
    console.log(`Skipping missing file: ${path}`);
    continue;
  }

  try {
    await testConfig(path);
  } catch (error) {
    console.log(`Test failed: ${error.message}`);
  }
}
