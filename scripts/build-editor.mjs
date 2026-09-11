import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const typeScriptLib = join(root, "editor/vscode-tee/lib/typescript");

rmSync(typeScriptLib, { recursive: true, force: true });
mkdirSync(typeScriptLib, { recursive: true });
for (const file of readdirSync(join(root, "node_modules/tee-typescript/lib"))) {
  if (/^lib(?:\..+)?\.d\.ts$/.test(file)) {
    cpSync(
      join(root, "node_modules/tee-typescript/lib", file),
      join(typeScriptLib, file),
    );
  }
}

await build({
  absWorkingDir: root,
  entryPoints: [join(root, "src/tee/tee-lsp.ts")],
  bundle: true,
  platform: "node",
  mainFields: ["module", "main"],
  format: "cjs",
  outfile: join(root, "editor/vscode-tee/lib/tee-lsp.cjs"),
  logLevel: "info",
});
