// Chạy toàn bộ môi trường admin cục bộ bằng một lệnh: `npm run dev` ở thư mục gốc.
// 1. Bật container Postgres (qua docker-compose.dev.yml, expose cổng 5432 cho venv Python).
// 2. Chạy FastAPI (api/.venv) với reload, cổng 8000.
// 3. Chạy Next.js admin surface (web/, dev:admin), cổng 3100.
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

function run(name, command, args, opts = {}) {
  const child = spawn(command, args, { stdio: "inherit", shell: true, ...opts });
  child.on("exit", (code, signal) => {
    console.log(`[${name}] đã dừng (code=${code}, signal=${signal})`);
  });
  return child;
}

console.log("[db] docker compose up -d db ...");
const db = spawn(
  "docker",
  ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.dev.yml", "up", "-d", "db"],
  { stdio: "inherit", shell: true, cwd: repoRoot },
);

db.on("error", (err) => {
  console.error("Không chạy được Docker. Cài/khởi động Docker Desktop rồi thử lại.", err.message);
  process.exit(1);
});

db.on("exit", (code) => {
  if (code !== 0) {
    console.error("Không khởi động được Postgres qua Docker (xem log phía trên). Dừng.");
    process.exit(code ?? 1);
  }

  const pythonExe = isWin
    ? path.join(repoRoot, "api", ".venv", "Scripts", "python.exe")
    : path.join(repoRoot, "api", ".venv", "bin", "python");

  const children = [
    run("api", pythonExe, ["-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"], {
      cwd: path.join(repoRoot, "api"),
    }),
    run("admin", "npm", ["run", "dev:admin"], { cwd: path.join(repoRoot, "web") }),
  ];

  const shutdown = () => {
    for (const child of children) child.kill();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
});
