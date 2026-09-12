# Conditionals

## TSX: `t-if` chain

Sibling chain. Same idea as Vue `v-if`.

```tsx
<p t-if={self.count === 0} class="empty">还没点过。</p>
<p t-else-if={Number(self.count) < 5} class="ok">继续点。</p>
<p t-else class="ok">已经 {self.count} 次了。</p>
```

False branches are **not** on the tree. Switching mounts / unmounts real nodes. A child component inside the branch is created when the branch enters, destroyed when it leaves — entering again mounts a new instance. Do not expect the first `DocumentFragment` to still have children.

## `t-show`

SFC / HTML: `t-show` **inserts or removes** the node (not `display: none`).

```html
<div t-show="ok">...</div>
```

TSX types mention `t-show`, but the TSX path does not implement it as a structural directive. In `.tee` TSX, use `t-if`.

## Do not

```tsx
// setup does not re-run — this is a one-shot snapshot
return self.ok ? <p>yes</p> : <p>no</p>;
```

Use `t-if` so the condition stays a getter.
