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

console.log(`Install Tee highlighting:

  命令面板 → 扩展: 从 VSIX 安装… (Extensions: Install from VSIX…)
  → ${target}

  资源管理器里看到 tee-language.vsix 并不等于已安装。
  装好后扩展列表里应出现 Tee，右下角语言为 Tee，标签页是金色 T。
`);
process.exit(0);
