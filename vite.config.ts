import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      tee: resolve(root, "src/tee/index.ts"),
    },
  },
  server: {
    port: 43151,
    host: "0.0.0.0",
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    port: 43151,
    host: "0.0.0.0",
    strictPort: true,
  },
});
