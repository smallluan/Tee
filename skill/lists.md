# Lists

`setup` runs once. Building `<li>` with `.map()` or `for` at setup time freezes that snapshot.

## TSX: `<For>` (use this)

```tsx
import { setup } from "tee-framework";

export default setup(function TeaList(self) {
  self.teas = [
    { id: 1, name: "龙井" },
    { id: 2, name: "铁观音" },
  ];

  return (
    <ul>
      <For each={self.teas} by="id">
        {(item, index) => (
          <li>
            {index + 1}. {item.name}
          </li>
        )}
      </For>
    </ul>
  );
});
```

| Prop | Meaning |
| --- | --- |
| `each` | Array (write `{self.teas}` — compiled to a getter) |
| `by` | Field name for a stable key. `by="id"` → `item.id`. Omit → index (reorder rebuilds) |
| children | `(item, index) =>` real DOM |

`<For>` is a Tee helper. The compiler injects it from `jsx-runtime` if you did not import it. `import { For } from "tee-framework"` is also fine.

`by` as a function is **not** used for keys. Pass a string field name.

## Nested

```tsx
<For each={self.depts} by="id">
  {(dept) => (
    <section>
      <h2>{dept.name}</h2>
      <For each={dept.people} by="id">
        {(person) => <p>{person.name}</p>}
      </For>
    </section>
  )}
</For>
```

## SFC / HTML: `t-repeat`

Same engine. Attribute on the **repeated node**. `t-for` is an alias **in SFC/HTML only**.

```html
<li t-repeat="item in items" t-key="item.id">{{ item.name }}</li>
<li t-for="(item, index) in items" t-key="item.id">{{ index }} {{ item.name }}</li>
```

In TSX, `{item.name}` is a JS identifier. `t-repeat="item in items"` does not create a JS `item`. Use `<For>`.

TSX `t-repeat={self.items}` exists, but row fields still need a JS binding — prefer `<For>`.

## Mutate data, not the view

```tsx
self.add = () => {
  self.teas = [...self.teas, { id: Date.now(), name: "岩茶" }];
};
```

`<For>` / `t-repeat` insert, move, or destroy real nodes by key (Strata S4).
