# Lifecycle

```tsx
import { setup, onMounted, onUnmounted } from "tee-framework";

export default setup(function App(self) {
  onMounted(() => {
    // DOM is already mapped
    self.$refs.input?.focus();
  });
  onUnmounted(() => {
    // instance is going away
  });
  return <input t-ref="input" />;
});
```

Must be called during `setup()`.

## Timing

1. `setup` runs (once)
2. Returned DOM is mounted and mapped
3. `onMounted` callbacks
4. Writes flush through TwinMap
5. Destroy → `onUnmounted`

## Viewport materialization (default)

DOM-tied **sites** below the first viewport defer TwinMap linking until the node enters view (with a small buffer). Static DOM is still inserted; reactive bindings and maps promote silently via `IntersectionObserver` + idle batches.

- **No DOM node** (computed, watch): materializes immediately.
- **Opt out:** `Tee.create({ deferViewport: false })`.
- Off-screen `$refs` and bound text stay empty until promotion; plan `onMounted` for above-the-fold focus targets.

## Options leftovers

SFC / `Tee.create` options still accept `created`, `mounted`, `updated`, `unmounted`. New TSX modules should use `onMounted` / `onUnmounted`.
