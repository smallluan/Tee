# Directives and bindings

## `t-ref`

```tsx
<input t-ref="name" />
// self.$refs.name → the element
```

## `t-html` / `t-text`

```tsx
<article t-html={self.markup} />
<p t-text={self.plain} />
```

`t-html` sets `innerHTML`. Only use with trusted strings.

## `class` / `style`

TSX:

```tsx
<div class="page" />
<div class={self.on ? "on" : ""} />
<div class={{ on: self.on, off: !self.on }} />
<div style={{ color: self.color, fontSize: "14px" }} />
```

Object `class` keeps keys whose values are truthy. `className` is treated as `class`.

## SFC-only extras

These compile in `<template>` HTML. They are **not** the TSX default:

| Directive | Role |
| --- | --- |
| `t-bind` / `t-bind:class` / `t-bind:style` | Vue-style bind |
| `t-slot` | Named slot filler on a custom tag |
| `t-pre` | Skip compiling the subtree |
| `t-once` | Bind once, then freeze |
| `t-cloak` | Removed after mount (`Tee.create` host) |

In TSX, pass `class` / `style` / children directly instead of `t-bind`.
