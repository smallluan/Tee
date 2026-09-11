import "./style.css";
import { Tee } from "tee";

Tee.define("quote-card", {
  template: `
    <article class="quote-card">
      <div class="quote-kicker"><slot name="kicker">Tee</slot></div>
      <div class="quote-body"><slot></slot></div>
    </article>
  `,
});

Tee.define("tea-card", {
  template: `
    <article class="tea-card">
      <div class="badge"><slot name="badge">—</slot></div>
      <div class="body"><slot></slot></div>
      <div class="actions"><slot name="actions"></slot></div>
    </article>
  `,
});

const template = `
  <header class="topbar">
    <a class="logo" href="#top">Tee</a>
    <nav>
      <a href="#idea">思路</a>
      <a href="#live">现场</a>
      <a href="#maps">映射表</a>
      <a href="#start">上手</a>
    </nav>
    <span class="ver">v{{ teeVersion }}</span>
  </header>

  <section class="hero" id="top">
    <p class="eyebrow">响应式前端框架 · 无虚拟 DOM</p>
    <h1>{{ title }}</h1>
    <p class="lede">{{ slogan }}</p>
    <div class="kpis">
      <div class="kpi"><span>当前站点</span><b id="site-count">0</b></div>
      <div class="kpi"><span>插值演示</span><b>{{ name || "Tee" }}</b></div>
      <div class="kpi"><span>计算属性</span><b>{{ doubled }}</b></div>
    </div>
  </section>

  <section class="panel" id="idea">
    <h2>它怎么更新 DOM</h2>
    <p class="muted">数据一变，Tee 不去 diff 一棵虚拟树。它查两张表，只修补真正受影响的节点。</p>
    <div class="idea-grid">
      <article>
        <h3>正向表</h3>
        <p>属性 → 依赖它的真实 DOM 站点。例如 <code>name</code> 变了，只找到绑定 <code>{{ syntaxName }}</code> 的那几个文本节点。</p>
      </article>
      <article>
        <h3>反向表</h3>
        <p>站点 → 更新它需要读的属性。一个表达式用到 <code>price</code> 和 <code>qty</code> 时，任意一边变化都会按点修补。</p>
      </article>
      <article>
        <h3>点对点</h3>
        <p>没有 VNode，没有 Fiber。列表用 <code>t-key</code> 挪动已有元素，条件显示用注释锚点插入或卸下真实节点。</p>
      </article>
    </div>
  </section>

  <section class="panel" id="live">
    <h2>用 Tee 写的现场例子</h2>
    <p class="muted">这个页面本身就是 Tee 应用。改下面的输入，看插值、计算属性、观察者、条件显示同时动。</p>
    <div class="live-grid">
      <div>
        <label>你的名字 <code>{{ syntaxName }}</code></label>
        <input t-model="name" placeholder="输入后，标题区会一起变" />
        <p>你好，{{ name || "访客" }}。把数字改成 {{ count }}，两倍是 {{ doubled }}。</p>
        <div class="row">
          <button t-on:click="count = count + 1">count + 1</button>
          <button class="ghost" t-on:click="count = 1">重置</button>
        </div>
        <p t-show="count > 3" class="notice">条件显示：count 大于 3 时这段才进 DOM。</p>
        <p t-show="count <= 3" class="muted">条件显示：count 还没超过 3，这段在，上面那段不在。</p>
      </div>
      <div>
        <h3>观察者日志</h3>
        <div t-show="logs.length === 0" class="empty">改名字或 count，watch 会把差分写在这里。</div>
        <ol class="log">
          <li t-repeat="entry in logs">{{ entry }}</li>
        </ol>
      </div>
    </div>
  </section>

  <section class="panel">
    <h2>自定义插槽 + 嵌套遍历</h2>
    <p class="muted"><code>quote-card</code> 和 <code>tea-card</code> 是 <code>Tee.define</code> 注册的标签。具名插槽在父作用域编译，再插进子模板。</p>
    <div class="quote-row">
      <quote-card t-repeat="line in quotes" t-key="line.id">
        <template t-slot="kicker">{{ line.tag }}</template>
        <p>{{ line.text }}</p>
      </quote-card>
    </div>
    <div class="toolbar">
      <input t-model="query" placeholder="过滤茶名或分类，例如 岩" />
      <button class="ghost" t-on:click="query = ''">清空</button>
    </div>
    <div t-show="!hasMatches" class="empty">没有与「{{ query }}」匹配的茶。</div>
    <div t-show="hasMatches">
      <section class="category" t-repeat="category in filtered" t-key="category.id">
        <h3>{{ category.name }}</h3>
        <div class="grid">
          <tea-card t-repeat="tea in category.teas" t-key="tea.id">
            <template t-slot="badge">¥{{ tea.price }}</template>
            <h3>{{ tea.name }}</h3>
            <p t-show="tea.stock > 0">库存 {{ tea.stock }}</p>
            <p t-show="tea.stock <= 0" class="muted">已罄</p>
            <template t-slot="actions">
              <button t-bind:disabled="tea.stock <= 0" t-on:click="pick(tea)">点一杯</button>
            </template>
          </tea-card>
        </div>
      </section>
    </div>
    <p class="muted">已点 {{ pickedCount }} 杯。这是嵌套 <code>t-repeat</code> 上的计算属性。</p>
  </section>

  <section class="panel" id="maps">
    <h2>运行中的双向映射表</h2>
    <p class="muted">正向：属性到站点。反向：站点到属性。改上面任何输入，这两张表会跟着变。</p>
    <div class="maps">
      <section>
        <h3>Forward</h3>
        <pre id="forward-map">（编译中）</pre>
      </section>
      <section>
        <h3>Reverse</h3>
        <pre id="reverse-map">（编译中）</pre>
      </section>
    </div>
  </section>

  <section class="panel" id="start">
    <h2>最小用法</h2>
    <pre class="code">{{ sample }}</pre>
    <p class="footer-note">模板指令：<code>{{ syntaxExpr }}</code> · <code>t-show</code> · <code>t-repeat</code> · <code>t-key</code> · <code>t-on:click</code> · <code>t-bind</code> · <code>t-model</code> · <code>t-slot</code></p>
  </section>
`;

const app = Tee.create({
  el: "#app",
  template,
  data: () => ({
    title: "Tee",
    name: "",
    count: 1,
    query: "",
    logs: [] as string[],
    teeVersion: Tee.version,
    syntaxName: "{{ name }}",
    syntaxExpr: "{{ expr }}",
    quotes: [
      { id: 1, tag: "正向", text: "属性变化时，只查找依赖它的真实节点。" },
      { id: 2, tag: "反向", text: "修补某个节点前，先读齐它声明过的属性。" },
      { id: 3, tag: "抛弃 VDOM", text: "不造虚拟树，也不做树级 diff。" },
    ],
    picked: [] as number[],
    menu: [
      {
        id: "rock",
        name: "岩茶",
        teas: [
          { id: 1, name: "大红袍", price: 68, stock: 6 },
          { id: 2, name: "肉桂", price: 42, stock: 4 },
          { id: 3, name: "水仙", price: 36, stock: 0 },
        ],
      },
      {
        id: "white",
        name: "白茶",
        teas: [
          { id: 4, name: "白毫银针", price: 88, stock: 3 },
          { id: 5, name: "白牡丹", price: 48, stock: 8 },
        ],
      },
    ],
    sample: `import { Tee } from "tee";

Tee.create({
  el: "#app",
  template: "<h1>{{ title }}</h1>",
  data: { title: "Tee" },
  computed: { shout() { return this.title + "!"; } },
  watch: { title(next, prev) { console.log(prev, next); } },
});`,
  }),
  computed: {
    slogan() {
      const who = String(this.name || "点对点");
      return `${who} 更新真实 DOM。正向表记节点，反向表收集更新所需属性。`;
    },
    doubled() {
      return Number(this.count) * 2;
    },
    filtered() {
      const q = String(this.query ?? "").trim();
      const menu = this.menu as Array<{
        id: string;
        name: string;
        teas: Array<{ id: number; name: string; price: number; stock: number }>;
      }>;
      if (!q) return menu;
      return menu
        .map((category) => ({
          ...category,
          teas: category.name.includes(q)
            ? category.teas
            : category.teas.filter((tea) => tea.name.includes(q)),
        }))
        .filter((category) => category.teas.length > 0);
    },
    hasMatches() {
      return (this.filtered as unknown[]).length > 0;
    },
    pickedCount() {
      return (this.picked as number[]).length;
    },
  },
  watch: {
    name(next, prev) {
      (this.logs as string[]).unshift(`name ${JSON.stringify(prev)} → ${JSON.stringify(next)}`);
      trimLogs(this);
    },
    count(next, prev) {
      (this.logs as string[]).unshift(`count ${prev} → ${next}`);
      trimLogs(this);
    },
  },
  methods: {
    pick(tea: { id: number; stock: number; name: string }) {
      if (tea.stock <= 0) return;
      tea.stock -= 1;
      (this.picked as number[]).push(tea.id);
    },
  },
});

function trimLogs(scope: { logs?: string[] }) {
  if (scope.logs && scope.logs.length > 8) scope.logs.length = 8;
}

function paintMaps() {
  const snap = app.maps();
  const forward = snap.forward
    .slice(0, 20)
    .map((row) => {
      const sites = row.sites.map((site) => `#${site.id}:${site.kind}`).join(", ");
      return `${row.prop}\n  → ${sites || "(empty)"}`;
    })
    .join("\n\n");
  const reverse = snap.reverse
    .filter((site) => site.kind !== "computed" && site.kind !== "watch")
    .slice(0, 20)
    .map((site) => {
      const props = site.debugProps.join(", ") || site.props.join(", ");
      return `#${site.id} ${site.kind} ${site.label}\n  ← ${props}\n  ${site.node}`;
    })
    .join("\n\n");
  const forwardEl = document.getElementById("forward-map");
  const reverseEl = document.getElementById("reverse-map");
  const countEl = document.getElementById("site-count");
  if (forwardEl) forwardEl.textContent = forward || "（暂无）";
  if (reverseEl) reverseEl.textContent = reverse || "（暂无）";
  if (countEl) countEl.textContent = String(snap.reverse.length);
}

app.onFlush(paintMaps);
paintMaps();
