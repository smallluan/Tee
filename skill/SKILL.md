---
name: tee
description: Tee (tee-framework) — no virtual DOM, TwinMap patches real nodes. Use when writing .tee files, setup(), For lists, t-on events, t-model, computed/watch, child components, or anything Tee-related.
---

# Tee skill pack

Tee is not React, Vue, or Svelte. Same words (`setup`, `computed`, `watch`), different contract.

**Do not invent APIs.** If a file in this folder does not describe it, Tee does not have it (no router, no SSR, no Suspense, no `useState`, no `v-for` in TSX).

Read **this index first**, then open **only** the topic you need.

## Index

| When you need to… | Open |
| --- | --- |
| Understand the contract vs React / Vue | [contract.md](contract.md) |
| Create an app, Vite, `Tee.create`, entry files | [project.md](project.md) |
| Write a `.tee` module (name, styles, TSX) | [authoring.md](authoring.md) |
| `self`, `$refs`, `$emit`, `$nextTick` | [self.md](self.md) |
| `computed` / `watch` / `watchEffect` / `ref` | [reactivity.md](reactivity.md) |
| `onMounted` / `onUnmounted` | [lifecycle.md](lifecycle.md) |
| Return DOM, `{expr}`, `Fragment` | [views.md](views.md) |
| Lists: `<For>`, not `.map()` | [lists.md](lists.md) |
| `t-if` / `t-else-if` / `t-else` / `t-show` | [conditionals.md](conditionals.md) |
| Events: `t-on:click`, real DOM names | [events.md](events.md) |
| Inputs: `t-model` | [forms.md](forms.md) |
| Child components, props, emit | [components.md](components.md) |
| `t-ref`, `t-html`, class / style | [directives.md](directives.md) |
| Reuse logic: `useXxx(self)` | [composition.md](composition.md) |
| Old SFC, `define("tea-card")`, slots | [sfc.md](sfc.md) |
| Compact API cheat sheet | [api.md](api.md) |
| Typical AI mistakes | [pitfalls.md](pitfalls.md) |

## Hard rules (always on)

1. `setup` **runs once**. Updates patch mapped DOM. Nothing re-renders the function.
2. Fields live on **`self`**. `{self.count}` is `self.count`. No `.value` in the view.
3. The **function name** is the component name: `setup(function CountChip(self) { ... })`.
4. Lists: `<For each={self.items} by="id">`. Never `self.items.map(...)` inside `setup`.
5. Events: `t-on:click`, `t-on:dblclick`, `t-on:compositionend`. Prefer `t-on:` over camelCase `onClick`.
6. Styles stay **outside** the component file: `import "./App.less"`.
7. `<For>` is Tee's list helper (compiler injects it). Not HTML. Not React.

Package: `tee-framework`. Scaffold: `create-tee`. Editor: `editor/tee-language.vsix`.
