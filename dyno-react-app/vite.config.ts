import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The REACT_APP_ prefix predates Vite. It's kept so the env vars already set
// locally and on Vercel don't need renaming.
export default defineConfig({
  plugins: [react()],
  envPrefix: "REACT_APP_",
  server: {
    port: 3000,
  },
  build: {
    outDir: "build",
  },
});
