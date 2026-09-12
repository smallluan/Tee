# Events

Tee does **not** use React synthetic events. `t-on:NAME` is `addEventListener(NAME)`.

## Write this

```tsx
<button t-on:click={() => (self.count = Number(self.count) + 1)}>
  count {self.count}
</button>

<input t-on:input={(e) => (self.guest = (e.target as HTMLInputElement).value)} />
<input t-on:compositionend={(e) => { /* IME */ }} />
<div t-on:dblclick={() => self.zoom()} />
<li t-on:dragstart={(e) => e.dataTransfer?.setData("text", self.id)} />
```

Prefer **`t-on:` + the real DOM name**:

| Need | Write |
| --- | --- |
| click | `t-on:click` |
| input | `t-on:input` |
| IME end | `t-on:compositionend` |
| dblclick | `t-on:dblclick` |
| dragstart | `t-on:dragstart` |
| keydown | `t-on:keydown` |

CamelCase `onClick` is accepted and lowercased (`click`). **`onDoubleClick` becomes `doubleclick`**, which is **not** `dblclick`. Use `t-on:dblclick`.

## Modifiers

`t-on:click.prevent`, `t-on:click.stop`, `t-on:click.self`, `t-on:click.capture`, `t-on:click.once`.

```tsx
<form t-on:submit.prevent={() => self.save()}>
```

Write the dotted name as one attribute. Tee rewrites it before TypeScript (TSX would otherwise split `t-on:submit` and `prevent`). `t-model.trim` is the same. Colon form `t-model:trim` also works.

## Child → parent

Child: `self.$emit("save", payload)`.

Parent: `t-on:save={(payload) => { ... }}`.

The name after `t-on:` is the emit name, not a DOM event.

## Do not

- `onClick={handler}` when you need `dblclick` / `compositionend`
- React `onChange` for every keystroke — use `t-on:input` or `t-model`
- Invent `t-on:Click` (case follows DOM)
