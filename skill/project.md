# Project

## Create

```bash
npm create tee@latest my-app
cd my-app
npm install
npm run dev
```

## Default tree

```
src/main.ts          Tee.create({ el: "#app", ...App })
src/App.tee          setup(function App)
src/CountChip.tee    setup(function CountChip) — imported as a child
src/App.less         styles for App; imported, not inlined
src/vite-env.d.ts    declare module "*.tee"
vite.config.ts       plugins: [tee()] from "tee-framework/plugin"
skill/               this pack
CLAUDE.md / AGENTS.md
```

## Entry

```ts
import { Tee } from "tee-framework";
import App from "./App.tee";

Tee.create({
  el: "#app",
  ...App,
});
```

`Tee.create` needs `el` (selector or `Element`). Spreading a `setup(...)` default export is the TSX app shape.

## Vite

```ts
import { defineConfig } from "vite";
import { tee } from "tee-framework/plugin";

export default defineConfig({
  plugins: [tee()],
});
```

`.tee` files compile as TSX unless they are a Vue-style SFC (`<template>` plus `<script>` or `<style>`). The plugin attaches a source map back to the `.tee` file. Compile failures start with `Tee compile <file>:`.

`tsconfig.json` should keep:

- `"jsx": "react-jsx"`
- `"jsxImportSource": "tee-framework"`
- `"allowArbitraryExtensions": true`

## Editor

`.tee` is not HTML. Install `tee-language.vsix` or the file is plain text:

1. Command Palette → Extensions: Install from VSIX…
2. `node_modules/tee-framework/editor/tee-language.vsix` (or `.vscode/tee-language.vsix`)
3. Reload

`npm install` does not replace an already-installed VSIX. Reinstall after a framework bump.

## Imports

```ts
import { Tee, setup, computed, watch, onMounted, For, Fragment } from "tee-framework";
import { tee } from "tee-framework/plugin";
```

`<For>` and `<>` work without a manual import; the compiler binds them from `tee-framework/jsx-runtime`. Named imports are still valid.
