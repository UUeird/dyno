import { execSync, spawn, ChildProcess } from "child_process";
import path from "path";

let backendProc: ChildProcess;

export default async function globalSetup() {
  // Kill any running dev backend on port 5000
  try { execSync("pkill -f 'node server.js'"); } catch {}
  await new Promise((r) => setTimeout(r, 600));

  // Start the backend pointed at carsDB_test
  const backendDir = path.resolve(__dirname, "../backend");
  backendProc = spawn("node", ["server.js"], {
    cwd: backendDir,
    env: { ...process.env, MONGO_DB: "carsDB_test", PORT: "5000" },
    stdio: "pipe",
  });

  // Wait until the server is ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Backend didn't start in time")), 10000);
    backendProc.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("Server running")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    backendProc.stderr?.on("data", (chunk: Buffer) => {
      console.error("[backend]", chunk.toString());
    });
  });

  // Seed test fixtures via the test-only endpoint
  const res = await fetch("http://localhost:5000/api/test/seed", { method: "POST" });
  if (!res.ok) throw new Error(`Seed failed: ${await res.text()}`);

  process.env.TEST_BACKEND_PID = String(backendProc.pid);
}
