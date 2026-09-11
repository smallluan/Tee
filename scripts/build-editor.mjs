import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  absWorkingDir: root,
  entryPoints: [join(root, "src/tee/tee-lsp.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: join(root, "editor/vscode-tee/lib/tee-lsp.cjs"),
  external: ["typescript"],
  logLevel: "info",
});
