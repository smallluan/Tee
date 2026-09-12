# Components

A component is a **named function** passed to `setup`. Import the `.tee` module and use the binding as a JSX tag.

```tsx
// CountChip.tee
import { setup } from "tee-framework";

export default setup(function CountChip(self) {
  return <span class="chip">{self.value}</span>;
});
```

```tsx
// App.tee
import CountChip from "./CountChip.tee";

export default setup(function App(self) {
  self.doubled = 0;
  return <CountChip value={self.doubled} />;
});
```

- Each instance has its **own** `self`.
- Parent attrs become fields on the child `self`.
- Getters (wrapped `{self.doubled}`) stay live on the child field.

## Emit

```tsx
// child
self.save = () => self.$emit("save", { name: self.name });

// parent
<Editor t-on:save={(row) => self.accept(row)} />
```

## Do not

- Name TSX components with hyphen tags (`<count-chip>`) as the identity. That is `define()` / SFC only.
- Pass `self` into the child as a prop named `self`.
- Expect React `children` render props except `<For>`'s `(item, index) =>`.
- Use slots as the default TSX story. Default slot content is passed as JSX children into `<slot>` if the child renders `<slot />`. See [sfc.md](sfc.md) for named `t-slot`.

## `define` (HTML custom element)

```ts
import { define, setup } from "tee-framework";

define("tea-card", {
  setup(self) { /* ... */ },
  template: `<p>{{ title }}</p>`,
});
```

The tag **must contain a hyphen**. Use this for SFC/HTML pages, not as the TSX naming story.
