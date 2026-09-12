import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

/** Library build for npm: Node can load these .js files from node_modules. */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    target: "es2022",
    lib: {
      entry: {
        index: resolve(root, "src/tee/index.ts"),
        plugin: resolve(root, "src/tee/plugin.ts"),
        "jsx-runtime": resolve(root, "src/tee/jsx-runtime.ts"),
        "jsx-dev-runtime": resolve(root, "src/tee/jsx-dev-runtime.ts"),
      },
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      external: [/^node:/, "vite", "less", "typescript", "tee-typescript"],
    },
  },
});
