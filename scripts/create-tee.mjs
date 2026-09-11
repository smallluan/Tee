#!/usr/bin/env node
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const template = join(root, "templates", "starter");
const name = process.argv[2];

if (!name || name.startsWith("-")) {
  console.log(`Usage: create-tee <project-dir>

Scaffold a Tee app (Vite + .tee SFCs), the same shape as npm create vite.

  npx create-tee my-app
  npm create tee my-app
`);
  process.exit(name ? 1 : 0);
}

const dest = resolve(process.cwd(), name);
if (existsSync(dest) && readdirSync(dest).length > 0) {
  console.error(`create-tee: ${name} already exists and is not empty.`);
  process.exit(1);
}

cpSync(template, dest, { recursive: true });

const pkgPath = join(dest, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.name = name
  .replace(/[^A-Za-z0-9-]+/g, "-")
  .replace(/^-|-$/g, "")
  .toLowerCase() || "tee-app";
const rel = relative(dest, root).replaceAll("\\", "/") || ".";
pkg.dependencies = pkg.dependencies ?? {};
pkg.dependencies.tee = `file:${rel}`;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log(`
  Tee app created in ${name}

    cd ${name}
    npm install
    npm run dev
`);
