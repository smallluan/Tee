# API cheat sheet

Imports from `tee-framework` unless noted.

## App

| Name | Use |
| --- | --- |
| `Tee.create({ el, ...App })` | Mount |
| `Tee.define` / `define(tag, def)` | Hyphen custom tag |
| `Tee.use(plugin)` | `plugin.install(Tee)` |
| `nextTick(fn?)` | After flush |
| `version` | String |
| `tee()` | Vite plugin — `tee-framework/plugin` |

`TeeApp`: `data`, `tick()`, `maps()`, `stats()`, `onFlush()`, `destroy()`.

## Setup

| Name | Use |
| --- | --- |
| `setup(function Name(self) { return <.../> })` | Component. Name = tag identity |
| `self` | Shared object |
| `self.$refs` / `$emit` / `$nextTick` / `$el` | Instance API |
| `router(self, { routes, mode? })` | Writes `$route` / `$router`. Default `hash` |
| `self.$route` | `{ path, fullPath, params, query, name }` |
| `self.$router` | `{ push, replace, back, mode }` |
| `<Link to>` / `<RouterView />` | Nav + outlet. Same pattern reuses the page |
| `computed(get)` | Derived field on `self` |
| `watch(source, cb?, opts?)` | After change; `{ immediate }` |
| `watchEffect(fn)` | `watch(fn)` |
| `ref(value)` | Optional box; view has no `.value` |
| `onMounted(fn)` / `onUnmounted(fn)` | During setup only |
| `current()` | `self` while setup runs |

## View (TSX)

| Name | Use |
| --- | --- |
| `{self.x}` | Live text |
| `<For each={self.list} by="id">` | List |
| `<>...</>` / `Fragment` | No wrapper |
| `t-if` / `t-else-if` / `t-else` | Branch |
| `t-on:click` / `t-on:input` / … | `addEventListener` |
| `.prevent` `.stop` `.self` `.capture` `.once` | Event mods |
| `t-model` / `t-model:trim` / `:number` / `:lazy` | Input |
| `t-ref="name"` | `$refs.name` |
| `t-html` / `t-text` | innerHTML / textContent |
| `class` / `style` objects | Bindings |
| `<Child prop={...} t-on:evt={...} />` | Child instance |

## SFC / HTML extra

`t-repeat` / `t-for` / `t-key`, `t-show`, `t-bind`, `t-slot`, `t-pre`, `t-once`, `t-cloak`, `provide` / `inject` on options, `<slot>`.

## Not exported as app APIs

`TwinMap`, `Engine`, `compileTSX`, `maps()` — internals / debugging. Do not build features on them unless the user asks.
