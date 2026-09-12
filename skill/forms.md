# Forms

## `t-model`

Two-way bind an input / textarea / select to a field on `self`.

```tsx
<input t-model="guest" placeholder="访客" />
<input t-model:trim="guest" />
<input t-model:number="count" />
<input t-model:lazy="title" />
```

SFC also accepts `t-model.trim` (dot form). TSX prefers `t-model:trim`.

| Modifier | Effect |
| --- | --- |
| `trim` | `String.prototype.trim` |
| `number` | coerce with `Number` (empty string stays `""`) |
| `lazy` | sync on `change` instead of `input` |

Checkbox / radio use `checked` and the `change` event. Select uses `change`.

The attribute value is the **field name** (`"guest"`), not `{self.guest}`.

## Manual

```tsx
<input
  value={self.guest}
  t-on:input={(e) => (self.guest = (e.target as HTMLInputElement).value)}
/>
```

Prefer `t-model` for simple fields.

## IME

For CJK composition, listen to `t-on:compositionend` in addition to `t-model` / `t-on:input` when you must see the committed string.
