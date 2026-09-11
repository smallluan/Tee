#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const teeRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(teeRoot, "bench", "js-framework-benchmark", "keyed", "tee");

const destArg = process.argv[2];
const benchmarkRoot = resolve(
  destArg ?? join(teeRoot, "..", "js-framework-benchmark"),
);

if (!existsSync(join(benchmarkRoot, "frameworks", "keyed"))) {
  console.error(`install-js-benchmark: not a js-framework-benchmark repo:
  ${benchmarkRoot}

Usage:
  node scripts/install-js-benchmark.mjs <path-to-js-framework-benchmark>

Example (your machine):
  node scripts/install-js-benchmark.mjs C:\\Users\\59805\\Desktop\\js-framework-benchmark
`);
  process.exit(1);
}

const dest = join(benchmarkRoot, "frameworks", "keyed", "tee");
mkdirSync(dirname(dest), { recursive: true });
cpSync(source, dest, { recursive: true });

const pkgPath = join(dest, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.dependencies = pkg.dependencies ?? {};
pkg.dependencies["tee-framework"] = "file:" + teeRoot.replaceAll("\\", "/");
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log(`Installed keyed Tee into:
  ${dest}

tee-framework → ${pkg.dependencies["tee-framework"]}

Next:
  cd "${dest}"
  npm install
  npm run build-prod

Then from the benchmark repo:
  npm ci
  npm run install-local
  npm start

In another terminal:
  cd webdriver-ts
  npm run isKeyed -- --headless true keyed/tee
  npm run bench -- --headless true keyed/tee keyed/vanillajs keyed/solid keyed/vue keyed/svelte keyed/react-hooks
  npm run results
`);
