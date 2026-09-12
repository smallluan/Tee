# Pitfalls (read when something “feels like React/Vue”)

## `setup` ran once

**Wrong:** expect the function to run again after `self.count++`.  
**Right:** the assignment patches mapped nodes. Put live conditions in `t-if` / `<For>` / `{self.x}`, not in JS branches that only ran at setup.

## Lists with `.map()`

**Wrong:**

```tsx
return <ul>{self.teas.map((t) => <li>{t.name}</li>)}</ul>;
```

**Right:** [lists.md](lists.md) — `<For each={self.teas} by="id">`.

## `For is not defined`

`<For>` is Tee, not a global HTML tag. Current `tee-framework` injects it at compile time. If you see `ReferenceError: For is not defined`, the installed package is older than 0.9.5. `npm i tee-framework@latest` and restart Vite.

`Cannot find name 'For'` in the editor: install/reload the VSIX, or `import { For } from "tee-framework"`.

## Events

**Wrong:** `onDoubleClick`, `onChange` as React.  
**Right:** `t-on:dblclick`, `t-on:input`, `t-model`. See [events.md](events.md).

## `.value` in the view

**Wrong:** `{self.doubled.value}`  
**Right:** `{self.doubled}` after `self.doubled = computed(...)`.

## Styles in the `.tee` file

**Wrong:** `<style>` in a TSX module.  
**Right:** `import "./App.less"`.

## Hyphen name as the TSX component

**Wrong:** `setup({ tag: "count-chip" })` as the TSX identity.  
**Right:** `setup(function CountChip(self) { ... })` and `<CountChip />`.

## Invented APIs

Tee has no router, SSR, Suspense, `useState`, `useEffect`, `v-for` in TSX, or `provide()` setup helper. See [contract.md](contract.md).

## `Cannot find module './X.tee'`

Need `src/vite-env.d.ts` (`declare module "*.tee"`) and a current Tee language service (0.9.5+). Reinstall the VSIX after upgrading.

## Child props look stale

Pass `{self.x}` (a getter after compile), not a one-shot `value={1}` if it should track. Parent field updates flow into the child `self`.

## `computed` outside setup

Throws. Call it from `setup` or from `useXxx(self)` invoked during setup.
