// Generates a build version string for the frontend bundle.
//
// Format: YYYY.MM.DD.HHMM-<sha> (e.g. "2026.05.19.1432-a3f2c8d")
// - Date/time is UTC at build time, so Vercel builds and local builds stay consistent
// - The trailing short SHA disambiguates multiple builds in the same minute and lets
//   us click through to the exact commit
//
// Output: writes a single line `REACT_APP_BUILD_VERSION=<value>` to .env.production.local.
// CRA reads that file automatically during `npm run build` and bakes the value into the
// bundle. For local `npm start` we deliberately don't generate this — the UI falls back
// to showing "dev".

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function pad(n) { return String(n).padStart(2, "0"); }

const now = new Date();
const date = `${now.getUTCFullYear()}.${pad(now.getUTCMonth() + 1)}.${pad(now.getUTCDate())}`;
const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;

let sha = "nohash";
try {
  // Vercel sets VERCEL_GIT_COMMIT_SHA for builds; locally we ask git directly.
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromEnv) {
    sha = fromEnv.slice(0, 7);
  } else {
    sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  }
} catch {
  // Build environment without git available — keep "nohash" placeholder
}

const version = `${date}.${time}-${sha}`;
const envPath = path.resolve(__dirname, "..", ".env.production.local");
fs.writeFileSync(envPath, `REACT_APP_BUILD_VERSION=${version}\n`);
console.log(`Generated build version: ${version}`);
