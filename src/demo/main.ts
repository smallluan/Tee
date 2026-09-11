import "./style.css";
import { Tee } from "tee";

Tee.define("mini-counter", {
  data: () => ({ n: 0 }),
  template: `<button class="btn" t-on:click="n = n + 1">独立组件状态：{{ n }}</button>`,
});

Tee.define("app-window", {
  template: `
    <section class="window">
      <header>
        <b><slot name="title">未命名窗口</slot></b>
        <span class="muted">自定义标签</span>
      </header>
      <div class="tools"><slot name="tools"></slot></div>
      <div class="body"><slot>空内容</slot></div>
    </section>
  `,
});

Tee.define("tea-card", {
  template: `
    <article class="tea-card">
      <div class="badge"><slot name="badge">—</slot></div>
      <slot></slot>
      <div><slot name="actions"></slot></div>
    </article>
  `,
});

const template = `
  <header class="nav">
    <a class="logo" href="#top">Tee</a>
    <nav>
      <a href="#map">能力</a>
      <a href="#interp">插值</a>
      <a href="#computed">计算</a>
      <a href="#watch">观察者</a>
      <a href="#show">条件</a>
      <a href="#repeat">遍历</a>
      <a href="#slots">插槽</a>
      <a href="#bind">绑定</a>
      <a href="#arch">架构</a>
      <a href="#api">API</a>
    </nav>
    <a class="nav-cta" href="https://cursor.com/codebase/sui-tan/tee">仓库</a>
  </header>

  <main class="wrap">
    <section class="hero" id="top">
      <p class="eyebrow">Reactive · No virtual DOM · v{{ teeVersion }}</p>
      <h1>点对点更新。</h1>
      <div class="hero-grid">
        <div>
          <p class="lede">Tee 不用虚拟 DOM。正向映射表记下每个属性对应哪些真实节点，反向映射表记下更新该节点要读的属性。数据一变，只 patch 那些 Node。</p>
          <div class="hero-actions">
            <a class="btn" href="#map">看全部能力</a>
            <a class="btn ghost" href="#arch">看双向映射表</a>
          </div>
        </div>
        <div class="hero-card">
          <label>现场插值 · {{ syntaxName }}</label>
          <input t-model="guest" placeholder="输入名字，整页标题区一起变" />
          <p class="hero-live">你好，{{ guest || "访客" }}</p>
          <p class="muted">右侧这张卡片、上面的问候、能力区里的名片预览，共用同一份 guest。变的是文本节点，不是整棵树。</p>
        </div>
      </div>
    </section>

    <section class="ribbon">
      <div><span>站点</span><b id="site-count">0</b></div>
      <div><span>计算属性</span><b>{{ doubled }}</b></div>
      <div><span>清单行</span><b>{{ personCount }}</b></div>
      <div><span>应付</span><b>¥{{ invoiceTotal }}</b></div>
    </section>

    <section class="section" id="map">
      <h2>能力地图</h2>
      <p class="kicker">下面每一块都是同一个 Tee 应用里的真交互，不是截图。点进去就能改数据、看 DOM 和映射表跟着动。</p>
      <div class="map-grid">
        <a href="#interp"><small>01</small><h3>插值</h3><p>文本与属性里的双花括号，拆成独立活节点。</p></a>
        <a href="#computed"><small>02</small><h3>计算属性</h3><p>派生值懒计算，依赖变了只通知下游站点。</p></a>
        <a href="#watch"><small>03</small><h3>观察者</h3><p>路径变化时拿到 next / prev，写副作用。</p></a>
        <a href="#show"><small>04</small><h3>条件显示</h3><p>t-show 用锚点插入或卸下真实节点。</p></a>
        <a href="#repeat"><small>05</small><h3>嵌套遍历</h3><p>部门套人员，t-key 复用已有 DOM。</p></a>
        <a href="#slots"><small>06</small><h3>自定义插槽</h3><p>具名 / 默认插槽在父作用域编译。</p></a>
        <a href="#bind"><small>07</small><h3>事件与表单</h3><p>t-on、t-bind、t-model、布尔属性。</p></a>
        <a href="#arch"><small>08</small><h3>双向映射</h3><p>Forward 与 Reverse 在运行时公开可检视。</p></a>
      </div>
    </section>

    <section class="feature" id="interp">
      <div class="copy">
        <div class="idx">01 / INTERPOLATION</div>
        <h3>插值语法</h3>
        <p>编译期把 {{ syntaxName }} 拆成独立 Text 节点。改 guest 只 patch 问候语；改 title 只 patch 名片标题。这就是点对点，不是重渲染整张卡。</p>
      </div>
      <div class="stage">
        <div class="stage-bar"><span class="dots"><i></i><i></i><i></i></span><span>live / interpolation</span></div>
        <div class="stage-body split">
          <div class="stack">
            <input class="field" t-model="card.title" placeholder="职位标题" />
            <input class="field" t-model="card.role" placeholder="角色" />
            <textarea class="field" t-model="card.bio" rows="3"></textarea>
          </div>
          <article class="preview-card">
            <div class="role">{{ card.role }}</div>
            <h4>{{ card.title }}</h4>
            <p>{{ guest || "访客" }} · {{ card.bio }}</p>
          </article>
        </div>
        <pre class="stage-code">{{ snippets.interp }}</pre>
      </div>
    </section>

    <section class="feature reverse" id="computed">
      <div class="copy">
        <div class="idx">02 / COMPUTED</div>
        <h3>计算属性</h3>
        <p>subtotal、tax、invoiceTotal 都是 computed。改单价或数量时，Tee 先让计算属性变脏，再只更新读过它们的 DOM 站点。count 的两倍在顶栏 ribbon 里同步。</p>
        <div class="row" style="margin-top:12px">
          <button class="btn" t-on:click="count = count + 1">count + 1（现 {{ count }}）</button>
          <mini-counter></mini-counter>
        </div>
        <p class="muted">右边的独立按钮是 Tee.define 组件自己的 data，和页面 count 互不污染。</p>
      </div>
      <div class="stage">
        <div class="stage-bar"><span class="dots"><i></i><i></i><i></i></span><span>live / computed</span></div>
        <div class="stage-body stack">
          <div class="split">
            <label class="muted">单价<input class="field" t-model="price" /></label>
            <label class="muted">数量<input class="field" t-model="qty" /></label>
          </div>
          <div class="totals">
            <div><span class="muted">小计</span><b>¥{{ subtotal }}</b></div>
            <div><span class="muted">税 6%</span><b>¥{{ tax }}</b></div>
            <div><span class="muted">应付</span><b>¥{{ invoiceTotal }}</b></div>
          </div>
        </div>
        <pre class="stage-code">{{ snippets.computed }}</pre>
      </div>
    </section>

    <section class="feature" id="watch">
      <div class="copy">
        <div class="idx">03 / WATCH</div>
        <h3>观察者</h3>
        <p>watch 订在 guest、count、invoiceTotal 上。每次差分以 next / prev 追加到列表。这是副作用通道，不参与 DOM diff，因为根本没有虚拟树可 diff。</p>
      </div>
      <div class="stage">
        <div class="stage-bar"><span class="dots"><i></i><i></i><i></i></span><span>live / watch</span></div>
        <div class="stage-body">
          <div t-show="logs.length === 0" class="empty">改名字、count 或发票数字，观察者会写在这里。</div>
          <ol class="log">
            <li t-repeat="entry in logs">{{ entry }}</li>
          </ol>
        </div>
        <pre class="stage-code">{{ snippets.watch }}</pre>
      </div>
    </section>

    <section class="feature reverse" id="show">
      <div class="copy">
        <div class="idx">04 / T-SHOW</div>
        <h3>条件显示</h3>
        <p>t-show 不是 CSS 隐藏。假时节点从树上拿掉并注销映射；真时再编译进去。下面三块状态互斥，同一时刻只有一块真实 DOM。</p>
      </div>
      <div class="stage">
        <div class="stage-bar"><span class="dots"><i></i><i></i><i></i></span><span>live / t-show</span></div>
        <div class="stage-body stack">
          <div class="row">
            <button class="btn" t-on:click="mode = 'idle'">空态</button>
            <button class="btn ghost" t-on:click="mode = 'ready'">就绪</button>
            <button class="btn ghost" t-on:click="mode = 'error'">错误</button>
          </div>
          <div t-show="mode === 'idle'" class="empty">空态：还没有开始。这段 DOM 在 mode 不是 idle 时会被销毁。</div>
          <div t-show="mode === 'ready'" class="notice">就绪：{{ guest || "访客" }} 可以继续往下看嵌套遍历。</div>
          <div t-show="mode === 'error'" class="empty">错误态：这是第三份互斥模板，不是 display:none。</div>
          <div class="stack">
            <article class="faq" t-repeat="item in faqs" t-key="item.id">
              <button t-on:click="openFaq = openFaq === item.id ? 0 : item.id">{{ item.q }}</button>
              <div t-show="openFaq === item.id" class="body">{{ item.a }}</div>
            </article>
          </div>
        </div>
        <pre class="stage-code">{{ snippets.show }}</pre>
      </div>
    </section>

    <section class="feature" id="repeat">
      <div class="copy">
        <div class="idx">05 / T-REPEAT</div>
        <h3>嵌套遍历</h3>
        <p>外层部门、内层人员。t-key 按 id 复用元素，新增一行不会拆掉旁边已有节点。personCount 是扫过嵌套数组的计算属性。</p>
      </div>
      <div class="stage">
        <div class="stage-bar"><span class="dots"><i></i><i></i><i></i></span><span>live / nested t-repeat</span></div>
        <div class="stage-body">
          <div class="row" style="margin-bottom:12px">
            <button class="btn" t-on:click="addDept()">加部门</button>
          </div>
          <section class="dept" t-repeat="dept in depts" t-key="dept.id">
            <h4>{{ dept.name }} <button class="btn ghost" t-on:click="addPerson(dept)">加人</button></h4>
            <div class="people">
              <div class="person" t-repeat="person in dept.people" t-key="person.id">
                <div>
                  <b>{{ person.name }}</b>
                  <div class="muted">{{ person.role }} · #{{ person.id }}</div>
                </div>
                <input class="field" t-model="person.name" />
              </div>
            </div>
          </section>
        </div>
        <pre class="stage-code">{{ snippets.repeat }}</pre>
      </div>
    </section>

    <section class="feature reverse" id="slots">
      <div class="copy">
        <div class="idx">06 / SLOTS</div>
        <h3>自定义插槽</h3>
        <p>app-window 提供 title / tools / 默认三个插入点。茶卡片再用具名 badge 与 actions。插槽内容在父作用域求值，所以 {{ syntaxName }} 读的是这一页的 guest。</p>
      </div>
      <div class="stage">
        <div class="stage-bar"><span class="dots"><i></i><i></i><i></i></span><span>live / slots</span></div>
        <div class="stage-body stack">
          <app-window>
            <template t-slot="title">{{ guest || "访客" }} 的工作台</template>
            <template t-slot="tools">
              <button class="btn ghost" t-on:click="urgent = !urgent">切换紧急</button>
            </template>
            <p t-bind:class="{ notice: urgent }">默认插槽。urgent 为 {{ urgent }} 时，这段会带左边绿条。</p>
          </app-window>
          <div t-show="!hasMatches" class="empty">没有与「{{ query }}」匹配的茶。</div>
          <div t-show="hasMatches">
            <div class="row"><input class="field" t-model="query" placeholder="过滤岩茶 / 白茶 / 茶名" /></div>
            <section t-repeat="category in filtered" t-key="category.id">
              <h4>{{ category.name }}</h4>
              <div class="grid">
                <tea-card t-repeat="tea in category.teas" t-key="tea.id">
                  <template t-slot="badge">¥{{ tea.price }}</template>
                  <h4>{{ tea.name }}</h4>
                  <p t-show="tea.stock > 0" class="muted">库存 {{ tea.stock }}</p>
                  <p t-show="tea.stock <= 0" class="muted">已罄</p>
                  <template t-slot="actions">
                    <button class="btn" t-bind:disabled="tea.stock <= 0" t-on:click="pick(tea)">点一杯</button>
                  </template>
                </tea-card>
              </div>
            </section>
          </div>
        </div>
        <pre class="stage-code">{{ snippets.slots }}</pre>
      </div>
    </section>

    <section class="feature" id="bind">
      <div class="copy">
        <div class="idx">07 / BIND · MODEL · ON</div>
        <h3>事件、属性、表单</h3>
        <p>t-model 回写输入；t-bind:disabled 在协议未勾选时关掉提交；t-on:click 跑方法。提交结果用 t-show 切到成功态。</p>
      </div>
      <div class="stage">
        <div class="stage-bar"><span class="dots"><i></i><i></i><i></i></span><span>live / bind + model</span></div>
        <div class="stage-body stack">
          <div t-show="!sent">
            <input class="field" t-model="form.email" placeholder="邮箱" />
            <label class="check"><input type="checkbox" t-model="form.agree" /> 同意把这次交互当作 Tee 的现场证据</label>
            <button class="btn" t-bind:disabled="!canSend" t-on:click="send()">提交</button>
            <p class="muted">canSend 是 computed：邮箱非空且勾选协议。</p>
          </div>
          <div t-show="sent" class="notice">已记下 {{ form.email }}。映射表里 model 站点还在，只是这块模板被卸下了。</div>
        </div>
        <pre class="stage-code">{{ snippets.bind }}</pre>
      </div>
    </section>

    <section class="section" id="arch">
      <h2>架构不是虚拟 DOM</h2>
      <p class="kicker">写入属性 → 查正向表得到站点集合 → 按反向表读齐表达式 → 只 patch 这些真实 Node。列表用 key 挪节点，条件用注释锚点。没有 VNode，没有 diff 算法。</p>
      <div class="flow">
        <div><strong>1. 写入</strong><span class="muted">guest / price / 数组 push</span></div>
        <div><strong>2. 正向</strong><span class="muted">property → Set&lt;Site&gt;</span></div>
        <div><strong>3. 反向</strong><span class="muted">Site → 所需属性</span></div>
        <div><strong>4. 点对点</strong><span class="muted">只改这些 Node</span></div>
      </div>
      <div class="maps" style="margin-top:18px">
        <section>
          <h3>Forward 属性到站点</h3>
          <pre id="forward-map">（编译中）</pre>
        </section>
        <section>
          <h3>Reverse 站点到属性</h3>
          <pre id="reverse-map">（编译中）</pre>
        </section>
      </div>
    </section>

    <section class="section" id="api">
      <h2>API</h2>
      <p class="kicker">精简公开面。页面、计算、观察、标签定义都从这里进。</p>
      <table class="api">
        <thead>
          <tr><th>接口</th><th>作用</th></tr>
        </thead>
        <tbody>
          <tr><td><code>Tee.create(options)</code></td><td>挂载应用。options：el、template、data、computed、watch、methods、tags。</td></tr>
          <tr><td><code>Tee.define(name, def)</code></td><td>注册自定义标签。def 可含 template、data、computed、methods、watch。</td></tr>
          <tr><td><code>{{ syntaxExpr }}</code></td><td>插值。每个表达式一个活文本节点。</td></tr>
          <tr><td><code>t-show</code></td><td>条件：插入或销毁真实 DOM。</td></tr>
          <tr><td><code>t-repeat</code> / <code>t-key</code></td><td>遍历，可嵌套。key 用来复用节点。</td></tr>
          <tr><td><code>t-on:event</code></td><td>事件。方法名或语句。</td></tr>
          <tr><td><code>t-bind:attr</code></td><td>属性绑定。布尔属性在假值时移除。</td></tr>
          <tr><td><code>t-model</code></td><td>输入回写到路径。</td></tr>
          <tr><td><code>t-slot</code> / <code>&lt;slot&gt;</code></td><td>具名与默认插槽。</td></tr>
          <tr><td><code>app.maps()</code></td><td>导出当前正向 / 反向表快照。</td></tr>
        </tbody>
      </table>
    </section>

    <footer class="footer">
      <div>Tee v{{ teeVersion }} · 已点 {{ pickedCount }} 杯</div>
      <a href="https://cursor.com/codebase/sui-tan/tee">sui-tan/tee</a>
    </footer>
  </main>
`;

const app = Tee.create({
  el: "#app",
  template,
  data: () => ({
    teeVersion: Tee.version,
    guest: "",
    count: 1,
    price: 42,
    qty: 2,
    query: "",
    mode: "idle",
    openFaq: 1,
    urgent: false,
    sent: false,
    logs: [] as string[],
    syntaxName: "{{ name }}",
    syntaxExpr: "{{ expr }}",
    form: { email: "", agree: false },
    card: { title: "点对点工程师", role: "Tee runtime", bio: "不写 VNode，只修真节点。" },
    faqs: [
      { id: 1, q: "为什么不是 Vue？", a: "没有模板编译成 VNode，也没有响应式再走 patch。映射表直接指向 Node。" },
      { id: 2, q: "为什么不是 React？", a: "没有函数组件渲染和 Fiber 调和。状态变了不去重画子树。" },
      { id: 3, q: "列表怎么更新？", a: "t-repeat 按 t-key 移动已有元素，新增则编译新实例，不是虚拟列表 diff。" },
    ],
    depts: [
      {
        id: 1,
        name: "编译",
        people: [
          { id: 11, name: "沈石", role: "模板行走" },
          { id: 12, name: "白毫", role: "插槽投影" },
        ],
      },
      {
        id: 2,
        name: "运行时",
        people: [{ id: 21, name: "岩骨", role: "映射表" }],
      },
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
    snippets: {
      interp: `<h4>{{ title }}</h4>\n<p>{{ guest }} · {{ bio }}</p>`,
      computed: `computed: {\n  invoiceTotal() {\n    return this.price * this.qty * 1.06\n  }\n}`,
      watch: `watch: {\n  invoiceTotal(next, prev) {\n    logs.unshift(prev + " → " + next)\n  }\n}`,
      show: `<div t-show="mode === 'ready'">就绪</div>\n<div t-show="mode === 'error'">错误</div>`,
      repeat: `<section t-repeat="dept in depts" t-key="dept.id">\n  <div t-repeat="person in dept.people" t-key="person.id">\n    {{ person.name }}\n  </div>\n</section>`,
      slots: `<app-window>\n  <template t-slot="title">{{ guest }} 的工作台</template>\n  默认插槽\n</app-window>`,
      bind: `<input t-model="form.email" />\n<button t-bind:disabled="!canSend" t-on:click="send()">提交</button>`,
    },
  }),
  computed: {
    doubled() {
      return Number(this.count) * 2;
    },
    subtotal() {
      return roundMoney(Number(this.price) * Number(this.qty));
    },
    tax() {
      return roundMoney(Number(this.subtotal) * 0.06);
    },
    invoiceTotal() {
      return roundMoney(Number(this.subtotal) + Number(this.tax));
    },
    personCount() {
      return (this.depts as Dept[]).reduce((sum, dept) => sum + dept.people.length, 0);
    },
    canSend() {
      const form = this.form as { email: string; agree: boolean };
      return Boolean(form.email.trim() && form.agree);
    },
    filtered() {
      const q = String(this.query ?? "").trim();
      const menu = this.menu as Menu;
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
    guest(next, prev) {
      pushLog(this, `guest ${fmt(prev)} → ${fmt(next)}`);
    },
    count(next, prev) {
      pushLog(this, `count ${prev} → ${next}`);
    },
    invoiceTotal(next, prev) {
      pushLog(this, `合计 ${prev} → ${next}`);
    },
  },
  methods: {
    addDept() {
      const depts = this.depts as Dept[];
      const id = Date.now();
      depts.push({ id, name: `小组 ${depts.length + 1}`, people: [] });
    },
    addPerson(dept: Dept) {
      dept.people.push({
        id: Date.now(),
        name: "新同事",
        role: "实习",
      });
    },
    pick(tea: { id: number; stock: number }) {
      if (tea.stock <= 0) return;
      tea.stock -= 1;
      (this.picked as number[]).push(tea.id);
    },
    send() {
      if (!this.canSend) return;
      this.sent = true;
    },
  },
});

type Person = { id: number; name: string; role: string };
type Dept = { id: number; name: string; people: Person[] };
type Menu = Array<{ id: string; name: string; teas: Array<{ id: number; name: string; price: number; stock: number }> }>;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function fmt(value: unknown) {
  return JSON.stringify(value);
}

function pushLog(scope: { logs?: string[] }, line: string) {
  if (!scope.logs) return;
  scope.logs.unshift(line);
  if (scope.logs.length > 10) scope.logs.length = 10;
}

function paintMaps() {
  const snap = app.maps();
  const forward = snap.forward
    .slice(0, 28)
    .map((row) => `${row.prop}\n  → ${row.sites.map((s) => `#${s.id}:${s.kind}`).join(", ")}`)
    .join("\n\n");
  const reverse = snap.reverse
    .filter((site) => site.kind !== "computed" && site.kind !== "watch")
    .slice(0, 28)
    .map((site) => `#${site.id} ${site.kind} ${site.label}\n  ← ${(site.debugProps.join(", ") || site.props.join(", "))}\n  ${site.node}`)
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
