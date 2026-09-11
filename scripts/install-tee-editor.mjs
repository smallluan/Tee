#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const vsix = join(root, "editor", "tee-language.vsix");
const ext = join(root, "editor", "vscode-tee");

if (!existsSync(vsix) && existsSync(join(ext, "package.json"))) {
  spawnSync(process.execPath, [join(root, "scripts", "pack-tee-vsix.mjs")], { stdio: "inherit" });
}

const target = existsSync(vsix) ? vsix : ext;
const bins = process.platform === "win32" ? ["cursor.cmd", "code.cmd", "cursor", "code"] : ["cursor", "code"];

for (const bin of bins) {
  const probe = spawnSync(bin, ["--version"], { encoding: "utf8", shell: process.platform === "win32" });
  if (probe.error || probe.status !== 0) continue;
  const args = existsSync(vsix) ? ["--install-extension", vsix, "--force"] : ["--install-extension", ext, "--force"];
  const inst = spawnSync(bin, args, { encoding: "utf8", shell: process.platform === "win32" });
  if (inst.status === 0) {
    console.log(`Installed Tee language support with ${bin}. Reload the window, then reopen *.tee files.`);
    process.exit(0);
  }
}

console.log(`Install Tee highlighting (required, otherwise .tee is plain text):

  Command Palette → Extensions: Install from VSIX…
  → ${target}

Then reload VS Code / Cursor. The tab icon is a gold T on ink, not a generic text file.
`);
process.exit(0);
