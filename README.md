# Tee

Tee 是一个精简但工程化的响应式前端框架。它**不使用虚拟 DOM**，也不走 Vue / React 那套「先造一棵虚拟树再 diff」的路子。

数据一变，Tee 只做一件事：在**双向映射表**里查出需要修补的真实 DOM 节点，然后点对点更新。

```
写入 data.price
    │
    ▼
正向表 forward[price]  →  { 站点#4, 站点#9 }
    │
    ▼
对每个站点查反向表 reverse[站点] → 更新该节点所需的属性
    │
    ▼
只 patch 这些 Node，不重建整棵树
```

## 核心结构

| 表 | 含义 |
| --- | --- |
| **正向映射** `property → Set<Site>` | 这个属性变了，哪些真实 DOM 站点必须更新 |
| **反向映射** `Site → Set<property>` | 更新这个站点时要读哪些属性 |

站点（Site）绑的是真实 `Text` / `Element` / 锚点注释，不是 VNode。列表用 `t-key` 对已有 DOM 实例做重排，仍然不是虚拟树 diff。

## 模板能力

- 插值 `{{ expression }}`
- 计算属性 `computed`
- 观察者 `watch`
- 条件显示 `t-show`
- 嵌套遍历 `t-repeat` / `t-key`
- 自定义标签 + 具名 / 默认插槽 `Tee.define` · `<slot>` · `t-slot`
- 事件 `t-on:click`
- 属性绑定 `t-bind:disabled`
- 表单回写 `t-model`

## 快速开始

```bash
npm install
npm run dev
```

浏览器打开 Vite 给出的地址（默认 `http://127.0.0.1:43151`）。首页是用 Tee 自己写的官网：能力地图覆盖插值、计算属性、观察者、条件显示、嵌套遍历、自定义插槽、事件/表单绑定，以及运行中的双向映射表。每个区块都是可交互的真应用，不是截图。

```bash
npm test
```

## 用法

```ts
import { Tee } from "tee";

Tee.define("tea-card", {
  template: `
    <article>
      <header><slot name="badge"></slot></header>
      <slot></slot>
    </article>
  `,
});

Tee.create({
  el: "#app",
  template: `
    <h1>{{ title }}</h1>
    <p>合计 ¥{{ total }}</p>
    <p t-show="items.length === 0">空托盘</p>
    <tea-card t-repeat="tea in items" t-key="tea.id">
      <template t-slot="badge">¥{{ tea.price }}</template>
      {{ tea.name }}
    </tea-card>
  `,
  data: {
    title: "青石茶寮",
    items: [{ id: 1, name: "肉桂", price: 42 }],
  },
  computed: {
    total() {
      return this.items.reduce((sum, tea) => sum + tea.price, 0);
    },
  },
  watch: {
    total(next, prev) {
      console.log("合计", prev, "→", next);
    },
  },
});
```

## 源码地图

```
src/tee/maps.ts      双向映射表
src/tee/engine.ts    依赖记录、通知、按站点批处理
src/tee/observe.ts   对真实对象做路径通知（不是 VNode）
src/tee/compile.ts   模板 → 站点，插值 / 条件 / 遍历 / 插槽
src/tee/scope.ts     计算属性、观察者、作用域链
src/demo/            用 Tee 写的框架介绍站
```

公开入口：`Tee.create`、`Tee.define`、`Tee.version`。
