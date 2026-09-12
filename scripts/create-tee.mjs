#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const self = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const template = join(root, "templates", "starter");
const name = process.argv[2];

if (!name || name.startsWith("-")) {
  console.log(`Usage: create-tee <project-dir>

Scaffold a Tee app (Vite + .tee TSX modules), the same shape as npm create vite.

  npm create tee my-app
  npx create-tee my-app
`);
  process.exit(name ? 1 : 0);
}

const dest = resolve(process.cwd(), name);
if (existsSync(dest) && readdirSync(dest).length > 0) {
  console.error(`create-tee: ${name} already exists and is not empty.`);
  process.exit(1);
}

cpSync(template, dest, { recursive: true });

const vsix = join(root, "editor", "tee-language.vsix");
if (existsSync(vsix)) {
  mkdirSync(join(dest, ".vscode"), { recursive: true });
  cpSync(vsix, join(dest, ".vscode", "tee-language.vsix"));
}

const pkgPath = join(dest, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.name =
  name
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "tee-app";
pkg.dependencies = pkg.dependencies ?? {};
const rel = relative(dest, root).replaceAll("\\", "/") || ".";
const fromGit = existsSync(join(root, ".git"));
pkg.dependencies[self.name] = fromGit ? `file:${rel}` : `^${self.version}`;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log(`
  Tee app created in ${name}

    cd ${name}
    npm install
    npm run dev

  .tee files need the Tee extension or they render as plain text.
  Command Palette → Extensions: Install from VSIX…
  → ${existsSync(vsix) ? ".vscode/tee-language.vsix" : "node_modules/tee-framework/editor/tee-language.vsix"}
  then reload. Tab icon should be a gold T, not a generic text file.
`);
