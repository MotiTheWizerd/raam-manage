import fs from "node:fs";
import http from "node:http";
import net from "node:net";

const DEFAULT_CONFIG_PATH = "C:\\SLPR\\data\\Local.properties";
const configPath = process.argv[2] || DEFAULT_CONFIG_PATH;

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

function maskSecret(value) {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-2)}`;
}

function tryDecodeBase64(value) {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function testTcp(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const startedAt = Date.now();

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.destroy();
      resolve({ ok: true, elapsedMs: Date.now() - startedAt });
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    socket.once("error", (error) => {
      resolve({ ok: false, error: error.message });
    });
  });
}

function readInitialBanner(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const chunks = [];
    const socket = net.createConnection({ host, port });

    socket.setTimeout(timeoutMs);
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      socket.destroy();
    });
    socket.once("timeout", () => socket.destroy());
    socket.once("error", (error) => resolve({ ok: false, error: error.message }));
    socket.once("close", () => {
      const buffer = Buffer.concat(chunks);
      resolve({
        ok: buffer.length > 0,
        bytes: buffer,
        hex: buffer.toString("hex").slice(0, 160),
        ascii: buffer.toString("latin1").replace(/[^\x20-\x7e]/g, ".").slice(0, 160),
      });
    });
  });
}

function guessProtocolFromBanner(buffer) {
  if (!buffer || buffer.length === 0) {
    return "No initial banner. Could still be PostgreSQL, MSSQL, Firebird, or a custom service.";
  }

  const text = buffer.toString("latin1").toLowerCase();
  if (text.includes("mysql") || text.includes("mariadb")) return "Looks like MySQL/MariaDB.";
  if (buffer.length > 5 && buffer[4] === 0x0a) return "Looks like MySQL/MariaDB handshake.";
  if (text.includes("firebird")) return "Looks like Firebird.";
  if (text.includes("postgres")) return "Looks like PostgreSQL.";

  return "Unknown from banner.";
}

function httpGet(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      response.once("end", () => {
        resolve({
          ok: true,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          server: response.headers.server,
        });
      });
    });

    request.once("timeout", () => {
      request.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    request.once("error", (error) => {
      resolve({ ok: false, error: error.message });
    });
  });
}

async function main() {
  console.log(`Reading config: ${configPath}`);

  const configText = fs.readFileSync(configPath, "utf8");
  const config = parseProperties(configText);
  const dbHost = config.DBHost;
  const dbPort = Number(config.DBPort);
  const remoteUrl = config.RemoteUrl;
  const decodedPassword = tryDecodeBase64(config.DBPass || "");

  console.log("\nConfig");
  console.log(`DBHost: ${dbHost}`);
  console.log(`DBPort: ${dbPort}`);
  console.log(`DBInstance: ${config.DBInstance}`);
  console.log(`DBUserName: ${config.DBUserName}`);
  console.log(`DBPass decoded: ${decodedPassword ? maskSecret(decodedPassword) : "(could not decode)"}`);
  console.log(`RemoteUrl: ${remoteUrl}`);

  console.log("\nTCP");
  const dbTcp = await testTcp(dbHost, dbPort);
  console.log(`DB port reachable: ${dbTcp.ok}${dbTcp.elapsedMs ? ` (${dbTcp.elapsedMs}ms)` : ""}${dbTcp.error ? ` - ${dbTcp.error}` : ""}`);

  console.log("\nDB banner");
  const banner = await readInitialBanner(dbHost, dbPort);
  console.log(`Banner received: ${banner.ok}`);
  if (banner.ok) {
    console.log(`Guess: ${guessProtocolFromBanner(banner.bytes)}`);
    console.log(`ASCII: ${banner.ascii}`);
    console.log(`HEX: ${banner.hex}`);
  } else {
    console.log(`Guess: ${guessProtocolFromBanner(null)}`);
    if (banner.error) console.log(`Error: ${banner.error}`);
  }

  if (remoteUrl) {
    console.log("\nHTTP");
    const httpResult = await httpGet(remoteUrl);
    if (httpResult.ok) {
      console.log(`GET ${remoteUrl}: ${httpResult.statusCode} ${httpResult.statusMessage}`);
      if (httpResult.server) console.log(`Server: ${httpResult.server}`);
    } else {
      console.log(`GET ${remoteUrl}: failed - ${httpResult.error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

