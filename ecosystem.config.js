const fs = require("fs");
const path = require("path");

// Reads the given keys out of .env.local (KEY=value lines; # comments skipped).
// Per-machine settings live there, untracked — not in this file.
function pickEnv(keys) {
  const out = {};
  let text = "";
  try {
    text = fs.readFileSync(path.join(__dirname, ".env.local"), "utf8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && keys.includes(m[1])) out[m[1]] = m[2];
  }
  return out;
}

module.exports = {
  apps: [
    {
      name: "raam-manage",
      script: "./node_modules/next/dist/bin/next",
      args: "start --port 3000",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-error.log",
      merge_logs: true,
      time: true,
    },
    {
      // Computer-vision service (vision/server.py) — serves the live
      // object-detection MJPEG feeds the app embeds behind the scan-eye toggle.
      // Runs under its own Python 3.11 venv. Lazy workers mean it sits idle
      // (no CPU) until a camera's detection stream is actually being viewed.
      name: "raam-vision",
      script: "server.py",
      // pythonw.exe (not python.exe) = the windowless Python — no console window
      // pops on the lobby desktop. -u keeps stdout/stderr unbuffered so logs
      // still flush promptly to the pm2 log files.
      interpreter: path.join(__dirname, "vision", ".venv", "Scripts", "pythonw.exe"),
      interpreter_args: "-u",
      args: "--port 8089",
      cwd: path.join(__dirname, "vision"),
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1500M",
      out_file: path.join(__dirname, "logs", "pm2-vision-out.log"),
      error_file: path.join(__dirname, "logs", "pm2-vision-error.log"),
      merge_logs: true,
      time: true,
    },
    {
      // Face-recognition sentry (vision/face_probe.py) — watches the lobby cam,
      // recognizes enrolled residents, and opens the matching GeoVision door.
      // The app's זיהוי פנים settings tab enrolls/forgets faces and arms/disarms
      // it over this service's localhost HTTP API (port 8090). Motion-gated, so
      // it sits near-idle until something actually moves in front of a camera.
      // Same windowless pythonw interpreter as raam-vision.
      name: "raam-face",
      script: "face_probe.py",
      interpreter: path.join(__dirname, "vision", ".venv", "Scripts", "pythonw.exe"),
      interpreter_args: "-u",
      args: "--cam lobby --port 8090",
      cwd: path.join(__dirname, "vision"),
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1500M",
      // Python doesn't read .env.local, so hand the sentry the GeoVision address
      // from there (unset = localhost, i.e. GeoVision on this same box).
      env: pickEnv(["GEOVISION_URL"]),
      out_file: path.join(__dirname, "logs", "pm2-face-out.log"),
      error_file: path.join(__dirname, "logs", "pm2-face-error.log"),
      merge_logs: true,
      time: true,
    },
    {
      // Camera chat (vision/tracing/chat_service.py) — the "talk to the
      // cameras" agent behind ניהול מצלמות → שיחה עם המצלמות, on localhost
      // :8095 (NOT 8090 — that's raam-face). Runs Claude through the Claude
      // Code CLI, so `claude` must be on this user's PATH and logged in. Reads
      // DATABASE_URL / recorder logins from .env.local itself.
      name: "raam-tracing-chat",
      script: "chat_service.py",
      interpreter: path.join(__dirname, "vision", ".venv", "Scripts", "pythonw.exe"),
      interpreter_args: "-u",
      cwd: path.join(__dirname, "vision", "tracing"),
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      out_file: path.join(__dirname, "logs", "pm2-tracing-chat-out.log"),
      error_file: path.join(__dirname, "logs", "pm2-tracing-chat-error.log"),
      merge_logs: true,
      time: true,
    },
    {
      // Hik SDK listener (vision/intercom/sdk_listen.py) — arms the 6 intercom
      // panels and the elevator recorder and appends their events to
      // logs/intercom-events.jsonl. It's the only motion source for those 12
      // follow-wall cameras (motion.ts tails the log). Listen-only.
      name: "raam-intercom-listener",
      script: path.join("intercom", "sdk_listen.py"),
      interpreter: path.join(__dirname, "vision", ".venv", "Scripts", "pythonw.exe"),
      interpreter_args: "-u",
      cwd: path.join(__dirname, "vision"),
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
      out_file: path.join(__dirname, "logs", "pm2-intercom-out.log"),
      error_file: path.join(__dirname, "logs", "pm2-intercom-error.log"),
      merge_logs: true,
      time: true,
    },
  ],
};
