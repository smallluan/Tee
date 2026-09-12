# Contract

Tee keeps a **TwinMap**: data path ↔ real DOM sites. A write looks up the forward map and patches those nodes. There is no virtual DOM and no component re-render.

```
self.count = 1
    → forward[count] → { text site, attr site, … }
    → Tee Strata queues the patch
    → only those nodes update
```

## Same words, not the same deal

| Word | In Tee |
| --- | --- |
| `setup` | Runs **once**. Receives `self`. May return real DOM. |
| `computed` | Cached field **on `self`**. View reads `self.label`, not `.value`. |
| `watch` / `watchEffect` | Run after mapped data changes. No re-render. |
| `onMounted` | DOM is already on the map. |
| `ref` | Optional. If you `return { n }` from setup, the view still uses `n`, not `n.value`. |

## Not React

- No `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`.
- No function re-run on update.
- No synthetic event system. `t-on:click` is `addEventListener("click")`.
- Do not `.map()` a list into JSX at setup time.

## Not Vue

- Template and script share **one object** (`self`). You do not return a bag of refs for the compiler to unwrap.
- TSX lists are `<For>`, not `v-for`. SFC leftover uses `t-repeat` / `t-for`.
- `t-show` **removes** the node from the tree (not `display: none`).
- Hyphen tags (`tea-card`) are only for `define()` / SFC custom elements. TSX components are **functions**.

## What Tee does not have

Do not add these unless the user asks you to build them from scratch:

- Nested routes, `beforeEach`, lazy route import, scroll behavior
- SSR / SSG
- Suspense, error boundaries, lazy/render boundaries
- Official store, i18n, head manager
- Markdown / MDX pipeline

Pages use `router(self, { routes })` + `<Link>` + `<RouterView>`. See [router.md](router.md).
