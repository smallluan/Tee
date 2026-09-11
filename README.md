# Tee

Tee 是一张**账本**，不是一棵要重画的树。

React 的哲学是「UI 是 state 的函数，更新就是再跑一遍」。Vue 的哲学是「组件实例持有状态，渲染产出视图」。Tee 的哲学是：**数据路径和真实 DOM 站点之间有一张双向表。程序的工作是往这张表里记账，不是生成虚拟树。**

```
写入 count
    │
    ▼
正向表 forward[count]  →  { 站点#4, 站点#9 }
    │
    ▼
按 Tee Strata 入队（派生 → 叶子 → 表达式 → 轨迹 → 结构）
    │
    ▼
只 patch 这些 Node
```

没有虚拟 DOM。没有「组件重渲染」。调度叫 **Strata**：能跳过的就不跑。公开基准另说，不在这里宣布最快。

## 词

这些词来自账本，不是从别的框架翻译过来的。

| 词 | 是什么 |
| --- | --- |
| **Chart** | 一份账本：名字、映射表、引擎 |
| **Slot** | 账本上的一个名字。模板、动作、派生都念这个名字 |
| **Site** | 一笔账：某个路径动了，要跑的那次修补。可以绑 Node，也可以不绑 |
| **Hold** | 写入可改的 slot |
| **Derive** | 派生 slot。值没变就不通知下游 |
| **Trail** | 没有 Node 的站点，跟着它读过的 slot 走 |
| **Act** | 命名动作。模板用 `t-on:click="bump"` 触发 |
| **Pin / Unpin** | 站点链进真实 DOM / 从账本上撕掉 |
| **Weave** | 一段往 Chart 上记账的函数。可嵌套，这就是组合 |

一套地址空间：模板里的 `{{ n }}`、weave 里的 `c.n`、trail 里读到的 `c.n` 是同一个 slot。没有 `.value`，没有 `this`，没有「setup 返回什么给模板」。

```ts
import { weave } from "tee-framework";

export default weave((c) => {
  c.hold({ n: 0 });
  c.derive("label", () => `×${Number(c.n) * 2}`);
  c.act("bump", () => {
    c.n = Number(c.n) + 1;
  });
  c.trail("title", () => {
    document.title = String(c.n);
  });
});
```

```html
<button t-on:click="bump">{{ label }}</button>
```

可复用的组合是普通函数，参数是同一张 Chart：

```ts
function counter(c) {
  c.hold({ n: 0 });
  c.act("bump", () => { c.n = Number(c.n) + 1; });
}

export default weave((c) => {
  c.weave(counter);
  c.derive("label", () => `n=${c.n}`);
});
```

对象选项（`data` / `methods` / `computed`）仍然可用，当作账本的另一种填法，不是 Tee 的身份。

## 一键创建项目

npm 包名是 **`tee-framework`**（`tee` 已被占用）。脚手架是 **`create-tee`**。

```bash
npm create tee@latest my-app
cd my-app
npm install
npm run dev
```

本仓库：

```bash
node scripts/create-tee.mjs my-app
```

```ts
import { Tee, weave } from "tee-framework";
import { tee } from "tee-framework/plugin";
```

## 本仓库演示

```bash
npm install
npm run dev
npm test
```

浏览器打开 `http://127.0.0.1:43151`。

## 和其他框架的翻译（不是 Tee 的身份）

自定义标签需要连字符，例如 `tea-card`。

| 别处 | Tee |
| --- | --- |
| Vue `data` / `ref` | `c.hold` / slot 名 |
| Vue `computed` | `c.derive` |
| Vue `watch` / Solid `createEffect` | `c.trail` |
| Vue `methods` | `c.act` |
| `onMounted` / `onUnmounted` | `c.pin` / `c.unpin` |
| 组合式函数返回一包 ref | weave 往同一张 Chart 记账 |
| `{{ expr }}` | 同左 |
| `v-if` / `v-else` | `t-if` / `t-else-if` / `t-else` |
| `v-show` | `t-show`（假值时从树上卸下） |
| `v-for` / `:key` | `t-repeat` 或 `t-for` / `t-key` |
| `v-on` / `@click.prevent` | `t-on:click.prevent` |
| `v-bind` / `:class` | `t-bind` / `t-bind:class` |
| `v-model` | `t-model`（`.lazy` `.number` `.trim`） |
| `v-html` / `v-text` | `t-html` / `t-text` |
| DOM `ref` | `t-ref` → `$refs` |
| `provide` / `inject` | 同名 |
| 插槽 | `<slot>` / `t-slot` |
| `.vue` + Less scoped | `.tee` + `lang="less"` scoped |

编辑器材料在 `editor/`：HTML custom data、TextMate 语法、`*.tee` 类型。

## `.tee` 单文件组件

构建期拆成三块，浏览器只拿到 JS / CSS：

```tee
<template>
  <p t-if="ok">{{ guest }}</p>
  <button t-on:click="bump">{{ count }}</button>
</template>

<script lang="ts">
import { weave } from "tee-framework";

export default weave({
  tag: "hello-box",
  install(c) {
    c.hold({ guest: "访客", count: 0, ok: true });
    c.act("bump", () => {
      c.count = Number(c.count) + 1;
    });
  },
});
</script>

<style lang="less" scoped>
@leaf: #215536;
p { color: @leaf; }
</style>
```

```ts
import { tee } from "tee-framework/plugin";
import { Tee } from "tee-framework";
import App from "./App.tee";

export default defineConfig({ plugins: [tee()] });
Tee.create({ el: "#app", ...App });
```

原生 HTML 会编成 `createElement` 工厂。字符串模板 `Tee.create({ template })` 仍然可用。

## 编辑器

- 仓库 `.vscode/settings.json`：`*.tee` 关联 HTML，并加载 `editor/tee.html-data.json`
- `editor/vscode-tee`：TextMate 语法
- `src/vite-env.d.ts`：`*.tee` 模块类型

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
| S0 | Derived | derive；`Object.is` 未变则不通知下游 |
| S1 | Leaf | 稳定路径；靠属性时钟决定是否求值 |
| S2 | Expr | 动态表达式；依赖集合没变就不 relink |
| S3 | Trail | 无 DOM 的站点，等数据格落定 |
| S4 | Structure | `t-if` / `t-show` / `t-repeat` 最后提交 |

## 源码地图

```
src/tee/maps.ts      双向映射表
src/tee/chart.ts     Chart / weave（组合）
src/tee/strata.ts    等级、时钟、计数
src/tee/ir.ts        表达式 IR
src/tee/html.ts      模板 HTML → AST
src/tee/codegen.ts   .tee → DOM 工厂
src/tee/sfc.ts       单文件拆块
src/tee/plugin.ts    Vite 插件
src/tee/compile.ts   挂载
src/tee/engine.ts    按等级冲洗
scripts/create-tee.mjs
templates/starter/
editor/
```

公开入口：`Tee.create`、`Tee.define`、`Tee.weave`、`Tee.nextTick`、`Tee.version`。

npm 包：`tee-framework`、`create-tee`。
