# Reactivity

All of these must run **inside `setup()`** (or a function called from setup). Outside setup they throw: `computed / watch / onMounted must run inside setup()`.

## `computed`

Cached field on `self`. The view uses the field name.

```tsx
self.count = 0;
self.doubled = computed(() => Number(self.count) * 2);
// view: {self.doubled}
```

No `.value` in JSX.

## `watch`

```tsx
// effect only
watch(() => {
  console.log(self.count);
});

// source + callback
watch(
  () => self.count,
  (next, prev) => {
    console.log(prev, "→", next);
  },
);

// field name
watch("count", (next, prev) => { /* ... */ });

watch(
  () => self.count,
  (next) => { /* ... */ },
  { immediate: true },
);
```

Returns a stop function. No component re-render.

`deep` exists on Options-API `watch` records, not on this `watch()` options object. The function form compares with `Object.is`.

## `watchEffect`

```tsx
watchEffect(() => {
  console.log(self.count, self.guest);
});
```

Same as `watch(effect)` with one function.

## `ref` (optional)

For people coming from Vue. Returning the box from `setup` writes the **inner** value onto `self`:

```tsx
export default setup(() => {
  const n = ref(0);
  const bump = () => {
    n.value = Number(n.value) + 1;
  };
  return { n, bump };
});
```

View still writes `{self.n}` / `{{ n }}`, not `n.value`.

Prefer assigning onto `self` directly in new code.

## Updating lists

Replace or mutate the array on `self`. `<For>` / `t-repeat` patch structure afterward.

```tsx
self.teas = [...self.teas, { id: Date.now(), name: "岩茶" }];
```

See [lists.md](lists.md).
