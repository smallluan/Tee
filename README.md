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
按 Tee Strata 等级入队（S0 → S4）
    │
    ▼
只 patch 这些 Node，不重建整棵树
```

这套调度叫 **Tee Strata**：按架构分层跳过工作，而不是在错误的抽象上做微优化。它让更新路径可预测，但**没有**宣称已经跑赢 Vue / Solid / React 的公开基准；那种结论只能拿同一套测量来说。

## 核心结构

| 表 | 含义 |
| --- | --- |
| **正向映射** `property → Set<Site>` | 这个属性变了，哪些真实 DOM 站点必须更新 |
| **反向映射** `Site → Set<property>` | 更新这个站点时要读哪些属性 |

站点（Site）绑的是真实 `Text` / `Element` / 锚点注释，不是 VNode。列表用 `t-key` 对已有 DOM 实例做重排，仍然不是虚拟树 diff。

## Tee Strata

两层格子，编译期一次，运行时每拍一次。

### 编译层（模板 → 内核）

| 层 | 名称 | 做什么 |
| --- | --- | --- |
| C0 | Parse | 递归下降编成 IR，热路径不再 `with(proxy)` |
| C1 | Classify | 稳定路径（ident / member）标成 Leaf，其余 Expr |
| C2 | Codegen | IR 生成 `Function`；解译只作回退 |
| C3 | Cache | 同一表达式只编一次 |

### 运行时等级（写入 → patch）

| 级 | 名称 | 做什么 |
| --- | --- | --- |
| S0 | Derived | computed；`Object.is` 未变则**不**通知下游 |
| S1 | Leaf | 稳定路径；冻结反向表；靠属性时钟决定是否求值 |
| S2 | Expr | 动态表达式；依赖集合没变就不 relink |
| S3 | Watch | 观察者，等数据格落定 |
| S4 | Structure | `t-show` / `t-repeat` 最后提交；key 未动则不挪 DOM |

一次写入会 bump 该属性的 interned clock，然后只把 `forward[prop]` 里的站点推进对应等级桶。computed 是 push + pull：S0 每拍最多算一次，后面的等级用时钟读缓存。

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

浏览器打开 Vite 给出的地址（默认 `http://127.0.0.1:43151`）。首页是用 Tee 自己写的官网：能力地图覆盖插值、计算属性、观察者、条件显示、嵌套遍历、自定义插槽、事件/表单绑定，以及运行中的 Strata 计数和双向映射表。每个区块都是可交互的真应用，不是截图。

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

`app.maps()` 导出当前正向 / 反向表。`app.stats()` 导出上一拍 Strata 计数：`notify` / `mark` / `run` / `skipClock` / `skipEqual` / `relink` / `patch`。

## 源码地图

```
src/tee/maps.ts      双向映射表（依赖集未变则不 relink）
src/tee/strata.ts    等级、时钟格子、Strata 计数
src/tee/ir.ts        表达式 IR + 代码生成
src/tee/engine.ts    通知、按等级冲洗
src/tee/observe.ts   对真实对象做路径通知（不是 VNode）
src/tee/compile.ts   模板 → 站点，插值 / 条件 / 遍历 / 插槽
src/tee/scope.ts     计算属性、观察者、作用域链
src/demo/            用 Tee 写的框架介绍站
```

公开入口：`Tee.create`、`Tee.define`、`Tee.version`。
