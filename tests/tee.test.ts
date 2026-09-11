import { describe, expect, it } from "vitest";
import { Tee } from "tee";
import { mount, tick } from "./helpers";

describe("interpolation + point-to-point patch", () => {
  it("splits interpolations into independent live text nodes", async () => {
    const { app, host } = mount({
      template: `<p><span id="a">{{ a }}</span><span id="b">{{ b }}</span></p>`,
      data: { a: 1, b: 2 },
    });
    const nodeA = host.querySelector("#a")!.firstChild as Text;
    const nodeB = host.querySelector("#b")!.firstChild as Text;
    expect(nodeA.textContent).toBe("1");
    expect(nodeB.textContent).toBe("2");

    app.data.a = 9;
    await tick(app);

    expect(host.querySelector("#a")!.firstChild).toBe(nodeA);
    expect(host.querySelector("#b")!.firstChild).toBe(nodeB);
    expect(nodeA.textContent).toBe("9");
    expect(nodeB.textContent).toBe("2");
  });

  it("updates a mixed text node from a single expression", async () => {
    const { app, host } = mount({
      template: `<p>Hello {{ name }}</p>`,
      data: { name: "Tee" },
    });
    expect(host.textContent).toBe("Hello Tee");
    app.data.name = "青石";
    await tick(app);
    expect(host.textContent).toBe("Hello 青石");
  });
});

describe("computed + watch", () => {
  it("recomputes derived values when dependencies change", async () => {
    const { app, host } = mount({
      template: `<p>{{ full }} / {{ total }}</p>`,
      data: { first: "青", last: "石", price: 10, qty: 2 },
      computed: {
        full() {
          return `${this.first}${this.last}`;
        },
        total() {
          return Number(this.price) * Number(this.qty);
        },
      },
    });
    expect(host.textContent).toBe("青石 / 20");
    app.data.qty = 3;
    await tick(app);
    expect(host.textContent).toBe("青石 / 30");
  });

  it("fires watchers with next and previous values", async () => {
    const calls: unknown[][] = [];
    const { app } = mount({
      template: `<span>{{ n }}</span>`,
      data: { n: 1 },
      watch: {
        n(next, prev) {
          calls.push([next, prev]);
        },
      },
    });
    app.data.n = 2;
    await tick(app);
    expect(calls).toEqual([[2, 1]]);
  });
});

describe("t-show", () => {
  it("inserts and removes real DOM rather than hiding via a virtual tree", async () => {
    const { app, host } = mount({
      template: `<p t-show="on" id="pane">shown {{ label }}</p>`,
      data: { on: false, label: "ok" },
    });
    expect(host.querySelector("#pane")).toBeNull();
    app.data.on = true;
    await tick(app);
    expect(host.querySelector("#pane")?.textContent).toBe("shown ok");
    app.data.label = "yes";
    await tick(app);
    expect(host.querySelector("#pane")?.textContent).toBe("shown yes");
    app.data.on = false;
    await tick(app);
    expect(host.querySelector("#pane")).toBeNull();
  });
});

describe("nested t-repeat", () => {
  it("renders nested lists and patches a single leaf", async () => {
    const { app, host } = mount({
      template: `
        <section t-repeat="group in groups" t-key="group.name">
          <h2>{{ group.name }}</h2>
          <span t-repeat="item in group.items" t-key="item.id" class="leaf">{{ item.title }}</span>
        </section>
      `,
      data: {
        groups: [
          {
            name: "A",
            items: [
              { id: 1, title: "one" },
              { id: 2, title: "two" },
            ],
          },
          { name: "B", items: [{ id: 3, title: "three" }] },
        ],
      },
    });
    const leaves = () => [...host.querySelectorAll(".leaf")].map((el) => el.textContent);
    expect(leaves()).toEqual(["one", "two", "three"]);
    const first = host.querySelector(".leaf")!;
    (app.data.groups as Array<{ items: Array<{ title: string }> }>)[0].items[0].title = "ONE";
    await tick(app);
    expect(host.querySelector(".leaf")).toBe(first);
    expect(leaves()).toEqual(["ONE", "two", "three"]);
  });

  it("adds and removes rows by key without rebuilding siblings", async () => {
    const { app, host } = mount({
      template: `<li t-repeat="item in items" t-key="item.id">{{ item.name }}</li>`,
      data: {
        items: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ],
      },
    });
    const before = host.querySelector("li:last-child");
    (app.data.items as Array<{ id: number; name: string }>).unshift({ id: 3, name: "c" });
    await tick(app);
    expect([...host.querySelectorAll("li")].map((el) => el.textContent)).toEqual(["c", "a", "b"]);
    expect(host.querySelector("li:last-child")).toBe(before);
  });
});

describe("custom slots", () => {
  it("projects named and default slot content in the parent scope", async () => {
    Tee.define("card-box", {
      template: `
        <article class="box">
          <header><slot name="title">untitled</slot></header>
          <div class="body"><slot>empty</slot></div>
        </article>
      `,
    });
    const { app, host } = mount({
      template: `
        <card-box>
          <template t-slot="title">{{ title }}</template>
          <p>{{ body }}</p>
        </card-box>
      `,
      data: { title: "岩茶", body: "肉桂" },
    });
    expect(host.querySelector("header")?.textContent).toBe("岩茶");
    expect(host.querySelector(".body")?.textContent).toBe("肉桂");
    app.data.title = "白茶";
    await tick(app);
    expect(host.querySelector("header")?.textContent).toBe("白茶");
  });

  it("falls back to default slot content", () => {
    Tee.define("plain-box", {
      template: `<div class="plain"><slot>fallback</slot></div>`,
    });
    const { host } = mount({
      template: `<plain-box></plain-box>`,
      data: {},
    });
    expect(host.textContent).toBe("fallback");
  });
});

describe("t-model", () => {
  it("writes input values back onto the data map", async () => {
    const { app, host } = mount({
      template: `<input id="q" t-model="query" /><span>{{ query }}</span>`,
      data: { query: "茶" },
    });
    const input = host.querySelector("#q") as HTMLInputElement;
    expect(input.value).toBe("茶");
    input.value = "岩";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick(app);
    expect(app.data.query).toBe("岩");
    expect(host.querySelector("span")?.textContent).toBe("岩");
  });
});
