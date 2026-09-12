# SFC leftover and `define`

Old Vue-style files still compile when the source has `<template>` **and** `<script>` or `<style>`:

```html
<template>
  <p t-if="count === 0">{{ guest }}</p>
  <button t-on:click="bump">{{ count }}</button>
</template>

<script lang="ts">
import { setup, computed } from "tee-framework";

export default setup((self) => {
  self.guest = "";
  self.count = 0;
  self.bump = () => {
    self.count = Number(self.count) + 1;
  };
});
</script>

<style lang="less">
p { color: #333; }
</style>
```

New work should be TSX + `import "./x.less"`. Scoped Less in SFC still exists; do not add `<style>` to TSX modules.

## Options object

```ts
export default {
  data: () => ({ n: 0 }),
  computed: {
    label() {
      return `×${this.n * 2}`;
    },
  },
  methods: {
    bump() {
      this.n += 1;
    },
  },
};
```

Same object, different fill. Prefer `setup(function Name)`.

## `define`

```ts
import { define } from "tee-framework";

define("tea-card", {
  template: `<h2>{{ title }}</h2><slot></slot>`,
});
```

Hyphen required. Then `<tea-card title="…">` in HTML/SFC.

## Slots (SFC / `define`)

- Child template: `<slot>` / `<slot name="foot">`
- Parent: default children, or `t-slot="foot"` on a filler node

TSX children become the default slot if the child renders `<slot />`.

## `provide` / `inject`

On `TagDef` / `TeeOptions` (options or `define`), not as `provide()` / `inject()` setup helpers.

```ts
define("tea-root", {
  provide: { theme: "ink" },
});
define("tea-leaf", {
  inject: ["theme"],
});
```
