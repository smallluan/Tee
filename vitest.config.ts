import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tee } from "./src/tee/plugin.ts";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [tee()],
  resolve: {
    alias: {
      tee: resolve(root, "src/tee/index.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
