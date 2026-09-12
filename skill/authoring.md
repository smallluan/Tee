# Authoring `.tee`

Default authoring is **TSX**. The whole file is `source.tsx` for highlighting.

## Shape

```tsx
import { setup, computed } from "tee-framework";
import CountChip from "./CountChip.tee";
import "./App.less";

export default setup(function App(self) {
  self.title = "新的 Tee 应用";
  self.count = 0;
  self.doubled = computed(() => Number(self.count) * 2);

  return (
    <main class="page">
      <h1>{self.title}</h1>
      <CountChip value={self.doubled} />
    </main>
  );
});
```

## Naming

- `setup(function App(self) { ... })` — **function name** is the component name.
- `setup` only binds the contract: run once, `self` is the shared object, returned DOM is mapped.
- Do **not** invent `tag: "app-root"` or hyphen custom-element names for TSX identity.

## Styles

- **Never** put `<style>` or CSS-in-JS in the component file.
- `import "./App.less"` (or `.css`) next to the module.
- One Less file per component is the starter convention, not a requirement.

## File types

| Kind | How |
| --- | --- |
| TSX `.tee` | `setup` returns DOM. This is the default. |
| SFC `.tee` | `<template>` + `<script>` + optional `<style>`. See [sfc.md](sfc.md). |
| `main.ts` | `Tee.create`. Not a component. |

## Imports of `.tee`

```tsx
import CountChip from "./CountChip.tee";
```

`src/vite-env.d.ts` and `tee-framework` declare `*.tee` as a `TeeComponent`.

## TypeScript

`.tee` is not a native TS extension. The Tee language service typechecks it. Keep `vite-env.d.ts` and `allowArbitraryExtensions`.
