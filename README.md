# Tee

Tee 不用虚拟 DOM。**数据路径和真实 DOM 站点之间有一张双向表。** 写入查正向表，按等级 patch 那些 Node。没有「组件重渲染」，也没有另一套词表。

```
写入 count
    │
    ▼
正向表 forward[count]  →  { 站点#4, 站点#9 }
    │
    ▼
按 Tee Strata 入队（computed → 叶子 → 表达式 → watch → 结构）
    │
    ▼
只 patch 这些 Node
```

公开基准另说，不在这里宣布最快。

## 哲学差在合同，不在单词

`setup` / `computed` / `watch` / `onMounted` / `ref` 你已经会写。Tee 不发明 hold、derive、trail、act、weave。差别是这三件事：

1. **脚本和视图共用同一份对象。** `self.count` 就是 `{self.count}`。不是 setup 返回一包 ref，再靠编译解开 `.value`。
2. **组件是函数，函数名就是组件名。** `setup` 只绑 Tee 的合同：这个函数只跑一次，`self` 是那份对象，返回的 DOM 进映射表。它不起名。
3. **样式不写在组件里。** `import "./App.less"`，和 React 一样从外面引进来。
4. **组合是普通函数往这份对象上写字段。** 更新是映射表上的站点，不是函数再跑一遍。
5. **路由写在同一份对象上。** `router(self, { routes })` 写下 `$route` / `$router`。`<RouterView>` 按路径模板复用页面，不重跑 App。

```tsx
import { setup, computed } from "tee-framework";
import CountChip from "./CountChip.tee";
import "./App.less";

export default setup(function App(self) {
  self.n = 0;
  self.label = computed(() => `×${Number(self.n) * 2}`);

  return (
    <button t-on:click={() => (self.n = Number(self.n) + 1)}>
      {self.label}
      <CountChip value={self.n} />
    </button>
  );
});
```

```tsx
import { setup } from "tee-framework";

export default setup(function CountChip(self) {
  return <span class="chip">{self.value}</span>;
});
```

`.tee` 按 TSX 高亮。旧的 `<template>` / `<script>` / `<style>` SFC 仍然能编。子组件引进来用函数名，每个有自己的 `self`，父级传入的属性就是子级上的同名字段。

可复用逻辑是普通函数，参数就是这份对象：

```ts
function useCounter(self) {
  self.n = 0;
  self.bump = () => {
    self.n = Number(self.n) + 1;
  };
}

export default setup((self) => {
  useCounter(self);
  self.label = computed(() => `n=${self.n}`);
});
```

路由和别的框架同一套词，合同跟 TwinMap 对齐：App 的 `setup` 只跑一次；`<RouterView>` 是一行 `<For>`，key 是路径模板（`/tea/:id`），不是解析后的 URL。`/tea/1` → `/tea/2` 复用页面实例，只改 `self.id`。

```tsx
import { setup, router, Link, RouterView } from "tee-framework";
import Home from "./Home.tee";
import Tea from "./Tea.tee";

export default setup(function App(self) {
  router(self, {
    routes: [
      { path: "/", component: Home },
      { path: "/tea/:id", component: Tea },
    ],
  });
  return (
    <main>
      <Link to="/">首页</Link>
      <RouterView />
    </main>
  );
});
```

默认 `hash`（不用服务器回退）。`history` 要主机能回 `index.html`。没有嵌套路由、`beforeEach`、lazy。

手顺还在的人可以继续 `ref` + `return`。Tee 会把返回值拆到同一份对象上，模板仍然写 `{{ n }}`，不是 `{{ n.value }}`：

```ts
export default setup(() => {
  const n = ref(0);
  const bump = () => {
    n.value = Number(n.value) + 1;
  };
  return { n, bump };
});
```

对象选项仍然可用，当作同一份对象的另一种填法：

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

## 一键创建项目

npm 包名是 **`tee-framework`**（`tee` 已被占用）。脚手架是 **`create-tee`**。

```bash
npm create tee@latest my-app
cd my-app
npm install
npm run dev
```

新项目出厂带 `CLAUDE.md`、`AGENTS.md` 和 `skill/`。AI 先读 `skill/SKILL.md` 再打开对应主题，不要按 React / Vue 猜 API。框架包里也有一份：`node_modules/tee-framework/skill/`.

本仓库：

```bash
node scripts/create-tee.mjs my-app
```

```ts
import { Tee, setup, computed } from "tee-framework";
import { tee } from "tee-framework/plugin";
```

## 本仓库演示

```bash
npm install
npm run dev
npm test
```

浏览器打开 `http://127.0.0.1:43151`。演示页本身用 Options API，旁边的独立计数器用 `setup()`，两套写法共一份运行时。

## 指令对照（模板层，不是身份）

自定义标签需要连字符，例如 `tea-card`。

| 别处 | Tee |
| --- | --- |
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
| `.vue` + Less scoped | `.tee` TSX + `import "./App.less"` |
| `setup` / `computed` / `watch` / `onMounted` / `ref` | 同名。合同不同：写在 `self` 上的名字就是模板名 |

编辑器：安装 `editor/tee-language.vsix`。不装的话 `.tee` 是纯文本。图标是墨色底上的金色 T。`.tee` 按 TSX 高亮。

## `.tee` 模块

默认写法是 TSX：`setup` 返回真实 DOM，样式外部引入。旧的 `<template>` / `<script>` / `<style>` SFC 仍然能编：

```tee
<template>
  <p t-if="ok">{{ guest }}</p>
  <button t-on:click="bump">{{ count }}</button>
</template>

<script lang="ts">
import { setup } from "tee-framework";

export default setup({
  tag: "hello-box",
  setup(self) {
    self.guest = "访客";
    self.count = 0;
    self.ok = true;
    self.bump = () => {
      self.count = Number(self.count) + 1;
    };
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

`.tee` **不是** HTML。把 `tee-language.vsix` 放在项目里**不会**自动安装。没装扩展且把语言设成 `tee` 时，VS Code 会当成纯文本（全白）。

1. Command Palette → **Extensions: Install from VSIX…**
2. 选 `editor/tee-language.vsix`（脚手架项目里是 `.vscode/tee-language.vsix`）
3. Reload，状态栏语言为 **Tee**，标签页图标为金色 T

扩展把整个 `.tee` 当 TSX 高亮，并补全 `tee-framework` 的 `setup` / `computed` 以及 `self` 上的字段。

`tee-framework` 自带 `*.tee` 模块声明；脚手架里的 `src/vite-env.d.ts` 再写一遍，给 `import App from "./App.tee"` 和 `import CountChip from "./CountChip.tee"` 用。

## Tee Strata

调度分层叫 Strata，和 React Fiber 一样是实现名，不是一套要你背的业务词。

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
src/tee/chart.ts     setup / computed / watch
src/tee/strata.ts    等级、时钟、计数
src/tee/ir.ts        表达式 IR
src/tee/html.ts      模板 HTML → AST
src/tee/codegen.ts   .tee → DOM 工厂
src/tee/sfc.ts       单文件拆块
src/tee/jsx.ts       TSX 运行时（setup 返回真实 DOM）
src/tee/router.ts    router / Link / RouterView
src/tee/plugin.ts    Vite 插件
src/tee/compile.ts   挂载
src/tee/engine.ts    按等级冲洗
scripts/create-tee.mjs
templates/starter/
editor/
```

公开入口：`Tee.create`、`Tee.define`、`Tee.setup`、`Tee.nextTick`、`Tee.version`，以及 `setup` / `computed` / `watch` / `onMounted` / `ref` / `router` / `Link` / `RouterView`。

npm 包：`tee-framework`、`create-tee`。发布到 npm 的是 `dist/` 里的 JavaScript（Node 加载 `vite.config.ts` 时不会给 `node_modules` 里的 `.ts` 剥类型）。
