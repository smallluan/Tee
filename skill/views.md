# Views (TSX DOM)

`setup` returns **real DOM** (via JSX). Expressions compile to getters so TwinMap can patch them. You do not return a virtual tree.

```tsx
return (
  <main class="page">
    <h1>{self.title}</h1>
    <p>{self.guest || "访客"}</p>
  </main>
);
```

`{self.title}` becomes a getter. Changing `self.title` patches that text node.

## Static vs live

- `"ok"` / `class="page"` — static
- `{self.count}` / `t-if={self.count === 0}` — live getter

Event handlers are **not** wrapped as getters: `t-on:click={() => { ... }}`.

## `Fragment`

```tsx
return (
  <>
    <h1>{self.title}</h1>
    <p>{self.lede}</p>
  </>
);
```

No extra wrapper node. `<Fragment>` is the same helper.

## What not to return

- A new element tree built with `.map()` each time (setup does not run again)
- Markdown strings as a framework feature
- Portals / hydrate APIs (not provided)

Lists: [lists.md](lists.md). Branches: [conditionals.md](conditionals.md).
