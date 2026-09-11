#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ext = join(root, "editor", "vscode-tee");

if (!existsSync(join(ext, "package.json"))) {
  console.error("tee-editor: missing editor/vscode-tee");
  process.exit(1);
}

const bins = ["cursor", "code"];
for (const bin of bins) {
  const probe = spawnSync(bin, ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) continue;
  const vsix = spawnSync("npx", ["--yes", "@vscode/vsce", "package", "--no-dependencies", "--skip-license", "--out", join(root, "tee-language.vsix")], {
    cwd: ext,
    encoding: "utf8",
  });
  if (vsix.status !== 0) {
    console.log(`Open Cursor / VS Code Command Palette:
  Developer: Install Extension from Location…
  → ${ext}
`);
    process.exit(0);
  }
  const inst = spawnSync(bin, ["--install-extension", join(root, "tee-language.vsix"), "--force"], { encoding: "utf8" });
  if (inst.status === 0) {
    console.log(`Installed Tee language support with ${bin}. Reload the window, then open a .tee file.`);
    process.exit(0);
  }
}

console.log(`Tee language support lives at:

  ${ext}

In Cursor / VS Code:
  Command Palette → Developer: Install Extension from Location…
  choose that folder, then reload the window.

*.tee files must use the Tee language (not HTML) so {{ }} and t-if are expressions, and <script> is TypeScript.
`);
