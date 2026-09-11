import "./style.css";
import { Tee } from "tee";

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
  <header class="hero">
    <div class="brand">
      <strong>Tee runtime</strong>
      <h1>{{ houseName }}</h1>
      <p>{{ slogan }}</p>
    </div>
    <div class="kpis">
      <div class="kpi"><span>托盘件数</span><b>{{ cartCount }}</b></div>
      <div class="kpi"><span>应付</span><b>¥{{ cartTotal }}</b></div>
      <div class="kpi"><span>映射站点</span><b id="site-count">0</b></div>
    </div>
  </header>

  <div class="layout">
    <section class="panel">
      <h2>茶单</h2>
      <div class="toolbar">
        <input t-model="query" placeholder="搜索茶名，例如 岩茶" />
        <button class="ghost" t-on:click="query = ''">清空</button>
      </div>
      <div t-show="!hasMatches" class="empty">没有与「{{ query }}」匹配的茶。换个词试试。</div>
      <div t-show="hasMatches">
        <section class="category" t-repeat="category in filtered" t-key="category.id">
          <h3>{{ category.name }}</h3>
          <div class="grid">
            <tea-card t-repeat="tea in category.teas" t-key="tea.id">
              <template t-slot="badge">¥{{ tea.price }}</template>
              <h3>{{ tea.name }}</h3>
              <p t-show="tea.stock > 0">库存 {{ tea.stock }} 两</p>
              <p t-show="tea.stock <= 0" class="muted">今日已罄</p>
              <template t-slot="actions">
                <button t-bind:disabled="tea.stock <= 0" t-on:click="addToCart(tea)">入托盘</button>
              </template>
            </tea-card>
          </div>
        </section>
      </div>
    </section>

    <aside class="panel">
      <h2>托盘</h2>
      <div t-show="cartEmpty" class="empty">托盘还是空的。点一杯岩茶或白毫。</div>
      <div t-show="!cartEmpty">
        <div class="cart-row" t-repeat="line in cart" t-key="line.id">
          <div>
            <b>{{ line.name }}</b>
            <div class="muted">¥{{ line.price }} × {{ line.qty }}</div>
          </div>
          <div class="qty">
            <button class="ghost" t-on:click="changeQty(line, -1)">−</button>
            <b>{{ line.qty }}</b>
            <button class="ghost" t-on:click="changeQty(line, 1)">+</button>
          </div>
          <button class="ghost" t-on:click="removeLine(line)">移除</button>
        </div>
        <p>合计 <b>¥{{ cartTotal }}</b></p>
      </div>
      <textarea class="note" t-model="note" placeholder="给茶博士的备注，例如少火、温杯。"></textarea>
      <p class="muted">备注预览：{{ note || "（未填写）" }}</p>
      <h2>观察者日志</h2>
      <div t-show="logs.length === 0" class="muted">改动茶单、搜索或合计时，观察者会把差分写到这里。</div>
      <ol class="log">
        <li t-repeat="entry in logs">{{ entry }}</li>
      </ol>
    </aside>
  </div>

  <section class="panel" style="margin-top:18px">
    <h2>双向映射表</h2>
    <p class="muted">正向表：属性 → 需要点对点修补的真实 DOM 站点。反向表：站点 → 更新该节点要读取的属性。没有虚拟 DOM。</p>
    <div class="maps">
      <section>
        <h3>Forward · 属性到站点</h3>
        <pre id="forward-map">（编译中）</pre>
      </section>
      <section>
        <h3>Reverse · 站点到属性</h3>
        <pre id="reverse-map">（编译中）</pre>
      </section>
    </div>
    <p class="footer-note">Tee {{ teeVersion }} · 插值 / 计算属性 / 观察者 / 自定义插槽 / 条件显示 / 嵌套遍历</p>
  </section>
`;

const app = Tee.create({
  el: "#app",
  template,
  data: () => ({
    houseName: "青石茶寮",
    query: "",
    note: "",
    logs: [] as string[],
    teeVersion: Tee.version,
    cart: [] as Array<{ id: number; name: string; price: number; qty: number }>,
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
      {
        id: "green",
        name: "绿茶",
        teas: [
          { id: 6, name: "龙井", price: 32, stock: 10 },
          { id: 7, name: "碧螺春", price: 38, stock: 2 },
        ],
      },
    ],
  }),
  computed: {
    slogan() {
      return `${this.houseName} · 点对点更新，不走虚拟 DOM`;
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
    cartCount() {
      return (this.cart as Array<{ qty: number }>).reduce((sum, line) => sum + line.qty, 0);
    },
    cartTotal() {
      return (this.cart as Array<{ qty: number; price: number }>).reduce(
        (sum, line) => sum + line.qty * line.price,
        0,
      );
    },
    cartEmpty() {
      return (this.cart as unknown[]).length === 0;
    },
  },
  watch: {
    query(next, prev) {
      (this.logs as string[]).unshift(`搜索 ${JSON.stringify(prev)} → ${JSON.stringify(next)}`);
      trimLogs(this);
    },
    cartTotal(next, prev) {
      (this.logs as string[]).unshift(`合计 ${prev ?? 0} → ${next}`);
      trimLogs(this);
    },
  },
  methods: {
    addToCart(tea: { id: number; name: string; price: number; stock: number }) {
      if (tea.stock <= 0) return;
      tea.stock -= 1;
      const cart = this.cart as Array<{ id: number; name: string; price: number; qty: number }>;
      const hit = cart.find((line) => line.id === tea.id);
      if (hit) hit.qty += 1;
      else cart.push({ id: tea.id, name: tea.name, price: tea.price, qty: 1 });
    },
    changeQty(line: { id: number; qty: number }, delta: number) {
      const tea = findTea(this.menu as Menu, line.id);
      const next = line.qty + delta;
      if (next <= 0) {
        this.removeLine(line);
        return;
      }
      if (delta > 0) {
        if (!tea || tea.stock <= 0) return;
        tea.stock -= 1;
        line.qty = next;
        return;
      }
      if (tea) tea.stock += 1;
      line.qty = next;
    },
    removeLine(line: { id: number; qty: number }) {
      const tea = findTea(this.menu as Menu, line.id);
      if (tea) tea.stock += line.qty;
      const cart = this.cart as Array<{ id: number }>;
      const index = cart.findIndex((row) => row.id === line.id);
      if (index >= 0) cart.splice(index, 1);
    },
  },
});

type Menu = Array<{ teas: Array<{ id: number; stock: number }> }>;

function findTea(menu: Menu, id: number) {
  for (const category of menu) {
    const tea = category.teas.find((item) => item.id === id);
    if (tea) return tea;
  }
  return undefined;
}

function trimLogs(scope: { logs?: string[] }) {
  if (scope.logs && scope.logs.length > 8) scope.logs.length = 8;
}

function paintMaps() {
  const snap = app.maps();
  const forward = snap.forward
    .slice(0, 24)
    .map((row) => {
      const sites = row.sites.map((site) => `#${site.id}:${site.kind}`).join(", ");
      return `${row.prop}\n  → ${sites || "(empty)"}`;
    })
    .join("\n\n");
  const reverse = snap.reverse
    .filter((site) => site.kind !== "computed" && site.kind !== "watch")
    .slice(0, 24)
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
