import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const surface = process.argv[2] || "admin";
const port = process.argv[3] || (surface === "admin" ? "3100" : "3000");

process.env.UELPATH_SURFACE = surface;
if (!process.env.UEL_PREVIEW_DIST_DIR) {
  process.env.UEL_PREVIEW_DIST_DIR = surface === "admin" ? ".next-admin" : ".next";
}

// Add local node_modules/.bin to PATH if not already included
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binDir = path.resolve(__dirname, "..", "node_modules", ".bin");
const pathKey = process.platform === "win32" ? "Path" : "PATH";
const currentPath = process.env[pathKey] || "";
if (!currentPath.includes(binDir)) {
  process.env[pathKey] = `${binDir}${path.delimiter}${currentPath}`;
}

const child = spawn("next", ["dev", "-p", String(port)], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("error", (err) => {
  console.error("Failed to start Next dev server:", err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
