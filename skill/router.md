# Router

`router(self, { routes })` is the built-in composable. App `setup` runs once. Navigation patches `$route` and the outlet — it does not remount App.

```tsx
import { setup, router, Link, RouterView } from "tee-framework";
import Home from "./Home.tee";
import About from "./About.tee";
import Tea from "./Tea.tee";

export default setup(function App(self) {
  router(self, {
    mode: "hash",
    routes: [
      { path: "/", component: Home },
      { path: "/about", component: About },
      { path: "/tea/:id", component: Tea },
      { path: "*", component: NotFound },
    ],
  });

  return (
    <main>
      <nav>
        <Link to="/">首页</Link>
        <Link to="/about">关于</Link>
        <Link to="/tea/longjing">龙井</Link>
      </nav>
      <RouterView />
    </main>
  );
});
```

`<Link>` and `<RouterView>` are injected like `<For>`. A named import is still valid.

## `$route` / `$router`

Written onto the same `self` that called `router()`:

| Field | Shape |
| --- | --- |
| `self.$route` | `{ path, fullPath, params, query, name }` |
| `self.$router` | `{ push(to), replace(to), back(), mode }` |

The page in `<RouterView>` gets the same `$route` / `$router`, plus each `:param` as a field. `/tea/:id` → `self.id`.

```tsx
export default setup(function Tea(self) {
  return <h1>{self.id}</h1>;
});
```

`self.$router.push("/tea/2?tab=leaf")` — path and query both land on `$route`.

## Performance (do not fight this)

- Do **not** remount App or re-run App `setup` to change pages.
- `<RouterView>` is a one-row `<For>` keyed by the **route pattern** (`/tea/:id`), not the resolved URL.
- `/tea/1` → `/tea/2` **reuses** the page instance. `self.id` / `self.$route` update in place.
- A different pattern destroys the old page and mounts the new one.

That is the TwinMap contract: same mapped nodes, new field values.

## Mode

- Default **`hash`**. `#/about` — no server rewrite.
- **`history`** uses `pathname`. Only if the host falls back to `index.html`. Optional `base`.

`<Link>` sets `class="active"` when `$route.path` equals `to` (query ignored).

## Not included

No nested routes, `beforeEach`, lazy import, scroll behavior, or named views. Another `t-if` on the page is enough for in-page tabs.

Do not switch pages with `self.pages.map(...)` or by recreating `Tee.create`.
