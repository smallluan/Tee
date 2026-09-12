# `self`

`self` is the one reactive object for the instance. Setup writes it. The view reads the same names.

```tsx
export default setup(function App(self) {
  self.guest = "";
  self.count = 0;
  return <p>{self.guest} {self.count}</p>;
});
```

Assigning `self.count = 1` patches mapped sites. You do not call `setState`.

## Always present

| Field | Role |
| --- | --- |
| `$refs` | Elements marked `t-ref="name"` |
| `$emit(event, payload?)` | Notify the parent. Parent listens with `t-on:event` |
| `$nextTick(fn?)` | After the current flush |
| `$el` | Host element after mount (when set) |
| `$route` / `$router` | After `router(self, { routes })`. See [router.md](router.md) |

```tsx
self.$emit("save", { id: self.id });
await self.$nextTick();
self.$refs.box?.focus();
```

## What belongs on `self`

- State: numbers, strings, arrays, plain objects
- `computed(() => ...)`
- Methods: `self.bump = () => { self.count = Number(self.count) + 1 }`

Functions assigned to `self` become methods. `computed(...)` becomes a derived field. `ref(...)` assigned or returned writes the inner value onto `self`.

## Parent props

Parent attributes land on the child's `self` under the same name:

```tsx
<CountChip value={self.doubled} />
```

Child:

```tsx
export default setup(function CountChip(self) {
  return <span>{self.value}</span>;
});
```

`self.view` is a normal field (page name, etc.). It is not reserved.

## Do not

- Treat `self` as React props + state split.
- Read `self.count.value`.
- Expect `setup` to see later assignments as a second run — it already finished.
