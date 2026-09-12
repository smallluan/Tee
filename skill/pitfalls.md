# Pitfalls (read when something “feels like React/Vue”)

## `self.view` used to do nothing

Tee used to stash the setup return on `extras.view`, so `self.view = "home"` was a silent no-op. That slot is no longer a `self` field. `self.view` / `self.page` are yours. Names starting with `$` stay reserved (`$refs`, `$emit`, `$nextTick`).

## `t-on:submit.prevent` used to break

TypeScript JSX split the dotted name. Current Tee quotes it before emit. Prefer `t-on:submit.prevent={...}`. `e.preventDefault()` in the handler still works.

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

Tee has no SSR, Suspense, `useState`, `useEffect`, `v-for` in TSX, or `provide()` setup helper. Pages are `router` / `<Link>` / `<RouterView>` — [router.md](router.md). See [contract.md](contract.md).

## `Cannot find module './X.tee'`

Need `src/vite-env.d.ts` (`declare module "*.tee"`) and a current Tee language service (0.9.5+). Reinstall the VSIX after upgrading.

## Child props look stale

Pass `{self.x}` (a getter after compile), not a one-shot `value={1}` if it should track. Parent field updates flow into the child `self`.

## `computed` outside setup

Throws. Call it from `setup` or from `useXxx(self)` invoked during setup.
