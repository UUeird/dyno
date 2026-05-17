import { spawn } from "child_process";
import path from "path";

export default async function globalTeardown() {
  // Kill the test backend
  const pid = process.env.TEST_BACKEND_PID;
  if (pid) {
    try { process.kill(Number(pid)); } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }

  // Restart the dev backend on carsDB
  const backendDir = path.resolve(__dirname, "../backend");
  const dev = spawn("node", ["server.js"], {
    cwd: backendDir,
    env: { ...process.env, MONGO_DB: "carsDB", PORT: "5000" },
    stdio: "ignore",
    detached: true,
  });
  dev.unref(); // let it outlive this process
}
