"use strict"

const path = require("path")
const { spawn } = require("child_process")

const projectRoot = path.resolve(__dirname, "..")
const electronBin = require("electron")

function spawnProcess(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || projectRoot,
    stdio: "inherit",
    shell: false,
    env: options.env || process.env,
  })

  child.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error(`[${label}] failed to start: ${err.message}`)
  })

  return child
}

function spawnNpm(label, scriptArgs, options = {}) {
  if (process.platform === "win32") {
    return spawnProcess(label, process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npm ${scriptArgs.join(" ")}`], options)
  }
  return spawnProcess(label, "npm", scriptArgs, options)
}

const ui = spawnNpm("web-ui", ["--prefix", "./desktop/web", "run", "dev"])

const desktop = spawnProcess("desktop", electronBin, [path.join(__dirname, "main.js")], {
  env: {
    ...process.env,
    DESKTOP_DEV: "1",
    VITE_DEV_URL: "http://127.0.0.1:5173",
  },
})

let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  // eslint-disable-next-line no-console
  console.log(`\nReceived ${signal}, shutting down desktop dev stack...`)

  const killProcess = (proc) => {
    if (!proc || proc.killed) return
    try {
      if (process.platform === "win32") {
        // On Windows, use taskkill to ensure child processes are also terminated
        const { execSync } = require("child_process")
        execSync(`taskkill /pid ${proc.pid} /t /f`, { stdio: "ignore" })
      } else {
        proc.kill("SIGTERM")
      }
    } catch (err) {
      // Process may already be dead
    }
  }

  if (desktop) killProcess(desktop)
  if (ui) killProcess(ui)
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("exit", () => {
  if (!shuttingDown) {
    // Emergency cleanup if process exits unexpectedly
    if (desktop && !desktop.killed) desktop.kill("SIGKILL")
    if (ui && !ui.killed) ui.kill("SIGKILL")
  }
})

for (const [label, child] of [
  ["web-ui", ui],
  ["desktop", desktop],
]) {
  child.on("exit", (code) => {
    if (shuttingDown) return
    // eslint-disable-next-line no-console
    console.error(`[${label}] exited with code ${code}`)
    shutdown(`${label}-exit`)
  })
}
