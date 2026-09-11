# Tee

Tee 是一个面向生产的响应式前端框架。它**不使用虚拟 DOM**。数据一变，运行时只在双向映射表里查出需要修补的真实 DOM 节点，然后点对点更新。

这不是「已经跑赢所有框架」的声明。架构可以对齐 Solid / Vue 3 的更新模型（没有 VNode diff），公开基准只能靠同一套测量。Tee 的调度叫 **Tee Strata**：按等级跳过工作，`.tee` 在构建期编成 DOM 工厂。

```
写入 data.price
    │
    ▼
正向表 forward[price]  →  { 站点#4, 站点#9 }
    │
    ▼
按 Tee Strata 等级入队（S0 → S4）
    │
    ▼
只 patch 这些 Node，不重建整棵树
```

## 一键创建项目

和 `npm create vite` 一样：

```bash
npx create-tee my-app
cd my-app
npm install
npm run dev
```

在本仓库里也可以：

```bash
node scripts/create-tee.mjs my-app
```

生成的工程带 Vite、`.tee` 单文件组件、Less scoped、以及编辑器补全配置。

## 本仓库演示

```bash
npm install
npm run dev
npm test
```

浏览器打开 Vite 给出的地址（默认 `http://127.0.0.1:43151`）。首页是用 Tee 自己写的官网。

## Vue 基础能力对照

自定义标签需要带连字符（和 Web Components 一样），例如 `tea-card`。

| Vue | Tee |
| --- | --- |
| `{{ expr }}` | `{{ expr }}` |
| `v-if` / `v-else-if` / `v-else` | `t-if` / `t-else-if` / `t-else` |
| `v-show` | `t-show`（假值时从树上卸下，不是 `display:none`） |
| `v-for` / `:key` | `t-repeat` 或 `t-for` / `t-key` |
| `v-on:click` / `@click` / `.prevent` | `t-on:click` / `t-on:click.prevent` |
| `v-bind:title` / `:class` / `:style` | `t-bind:title` / `t-bind:class` / `t-bind:style` |
| `v-bind="obj"` | `t-bind="obj"` |
| `v-model` / `.lazy` `.number` `.trim` | `t-model` / 同样的修饰符 |
| `v-html` / `v-text` | `t-html` / `t-text` |
| `ref` | `t-ref` → `$refs` |
| `v-pre` / `v-once` / `v-cloak` | `t-pre` / `t-once` / `t-cloak` |
| `props` / `emit` | `props` / `$emit` |
| `provide` / `inject` | `provide` / `inject` |
| `created` `mounted` `updated` `unmounted` | 同名 |
| `nextTick` | `Tee.nextTick` / `$nextTick` |
| `computed` / `watch` / `watch.immediate` | 同名 |
| 插槽 | `<slot>` / `t-slot` |
| 插件 | `Tee.use({ install })` |
| `.vue` + `lang="less"` + `scoped` | `.tee` + `lang="less"` / `scss` + `scoped` |

代码提示不完全是运行时的职责，但框架必须把编辑器材料交出去：HTML custom data、TextMate 语法、`*.tee` 类型。Vue 有 Volar；Tee 在 `editor/` 和 `create-tee` 的 `.vscode` 里提供同等入口。

## `.tee` 单文件组件

构建期拆成三块，浏览器只拿到 JS / CSS：

```tee
<template>
  <p t-if="ok">{{ guest }}</p>
  <button t-on:click="count = count + 1">{{ count }}</button>
</template>

<script lang="ts">
export default {
  tag: "hello-box",
  data: () => ({ guest: "访客", count: 0, ok: true }),
};
</script>

<style lang="less" scoped>
@leaf: #215536;
p { color: @leaf; }
</style>
```

```ts
import { tee } from "tee/plugin";
import { Tee } from "tee";
import App from "./App.tee";

export default defineConfig({ plugins: [tee()] });
Tee.create({ el: "#app", ...App });
```

原生 HTML 会编成 `createElement` 工厂；`t-if` / `t-repeat` / 自定义标签走运行时挂载。字符串模板 `Tee.create({ template })` 仍然可用，不必过 Vite。

## 编辑器

- 仓库 `.vscode/settings.json`：`*.tee` 关联 HTML，并加载 `editor/tee.html-data.json`（`t-*` 补全）
- `editor/vscode-tee`：TextMate 语法（模板插值、`<script lang="ts">`、`<style lang="less">`）
- `src/vite-env.d.ts`：`import x from "./App.tee"` 有类型

在 Cursor / VS Code 用 **Install Extension from Location** 指向 `editor/vscode-tee` 即可启用高亮。

## Tee Strata

### 编译层

| 层 | 名称 | 做什么 |
| --- | --- | --- |
| C0 | Parse | 递归下降编成 IR，热路径不再 `with(proxy)` |
| C1 | Classify | 稳定路径标成 Leaf |
| C2 | Codegen | IR 生成 `Function`；`.tee` 再生成 DOM 工厂 |
| C3 | Cache | 同一表达式只编一次 |

### 运行时等级

| 级 | 名称 | 做什么 |
| --- | --- | --- |
| S0 | Derived | computed；`Object.is` 未变则不通知下游 |
| S1 | Leaf | 稳定路径；靠属性时钟决定是否求值 |
| S2 | Expr | 动态表达式；依赖集合没变就不 relink |
| S3 | Watch | 观察者，等数据格落定 |
| S4 | Structure | `t-if` / `t-show` / `t-repeat` 最后提交 |

## 源码地图

```
src/tee/maps.ts      双向映射表
src/tee/strata.ts    等级、时钟、计数
src/tee/ir.ts        表达式 IR
src/tee/html.ts      模板 HTML → AST
src/tee/codegen.ts   .tee → DOM 工厂
src/tee/sfc.ts       单文件拆块
src/tee/plugin.ts    Vite 插件（Less / scoped / HMR）
src/tee/compile.ts   挂载与运行时 helpers
src/tee/engine.ts    按等级冲洗
scripts/create-tee.mjs
templates/starter/
editor/              语法、补全、VS Code 扩展
```

公开入口：`Tee.create`、`Tee.define`、`Tee.use`、`Tee.nextTick`、`Tee.version`。
