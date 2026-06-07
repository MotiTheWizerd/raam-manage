const path = require("path");

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
  ],
};
