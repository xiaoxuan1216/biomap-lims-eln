import devServer from "@hono/vite-dev-server"
import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, __dirname, "BIOMAP_");
  const evidenceDirectory = path.resolve(process.env.BIOMAP_EVIDENCE_DIR || loaded.BIOMAP_EVIDENCE_DIR || ".data/run-evidence");
  return ({
  plugins: [
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    ...(process.env.ENABLE_KIMI_INSPECT === "true" ? [inspectAttr()] : []),
    react(),
  ],
  server: {
    port: 3000,
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.data/**", `${evidenceDirectory}/**`] },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      "db": path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
});
});
