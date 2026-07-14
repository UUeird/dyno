import { execSync, spawn, ChildProcess } from "child_process";
import path from "path";

let backendProc: ChildProcess;

export default async function globalSetup() {
  // Kill any running dev backend on port 5000
  try { execSync("pkill -f 'node server.js'"); } catch {}
  await new Promise((r) => setTimeout(r, 600));

  // Start the backend pointed at carsDB_test. Sam's seeded email is also marked
  // as admin so admin-only endpoints can be exercised by specs (e.g. trim setup).
  const backendDir = path.resolve(__dirname, "../backend");
  backendProc = spawn("node", ["server.js"], {
    cwd: backendDir,
    env: {
      ...process.env,
      MONGO_DB: "carsDB_test",
      PORT: "5000",
      ADMIN_EMAILS: "sam@samelawrence.com",
    },
    stdio: "pipe",
  });

  // Wait until the server is listening AND its startup migrations/seeding have
  // finished. "Server running" alone isn't enough — app.listen() fires as soon
  // as the module loads, independent of the async mongoose-connect chain that
  // runs migrations, so seeding via the API immediately after "Server running"
  // can race the backend's own startup seeding (duplicate-key errors on unique
  // indexes like Model's manufacturer+name).
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Backend didn't start in time")), 10000);
    let listening = false;
    let migrationsComplete = false;
    const maybeResolve = () => {
      if (listening && migrationsComplete) {
        clearTimeout(timeout);
        resolve();
      }
    };
    backendProc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes("Server running")) { listening = true; maybeResolve(); }
      if (text.includes("Startup migrations complete")) { migrationsComplete = true; maybeResolve(); }
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
