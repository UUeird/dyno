import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// envPrefix keeps existing REACT_APP_* env vars working unchanged (locally
// and on Vercel) through the CRA-to-Vite migration.
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
