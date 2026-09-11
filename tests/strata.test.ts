import { describe, expect, it } from "vitest";
import { Rank } from "tee";
import { mount, tick } from "./helpers";

describe("Tee Strata", () => {
  it("patches only the leaf whose property changed", async () => {
    const { app, host } = mount({
      template: `<span id="a">{{ a }}</span><span id="b">{{ b }}</span>`,
      data: { a: 1, b: 2 },
    });
    const nodeA = host.querySelector("#a")!.firstChild as Text;
    const nodeB = host.querySelector("#b")!.firstChild as Text;

    app.data.a = 9;
    await tick(app);

    expect(host.querySelector("#a")!.firstChild).toBe(nodeA);
    expect(host.querySelector("#b")!.firstChild).toBe(nodeB);
    expect(nodeA.data).toBe("9");
    expect(nodeB.data).toBe("2");
    expect(app.stats().patch).toBe(1);
    expect(app.stats().mark).toBe(1);
  });

  it("does not mark interpolations of an unchanged computed", async () => {
    const { app, host } = mount({
      template: `<span id="full">{{ full }}</span><span id="total">{{ total }}</span>`,
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
    const totalNode = host.querySelector("#total")!.firstChild as Text;
    app.data.first = "乌";
    await tick(app);
    expect(host.querySelector("#full")!.textContent).toBe("乌石");
    expect(host.querySelector("#total")!.firstChild).toBe(totalNode);
    expect(totalNode.data).toBe("20");
    expect(app.stats().patch).toBe(1);
  });

  it("reuses keyed rows without walking sibling DOM when only a leaf field changes", async () => {
    const { app, host } = mount({
      template: `<li t-repeat="item in items" t-key="item.id">{{ item.title }}</li>`,
      data: {
        items: [
          { id: 1, title: "one" },
          { id: 2, title: "two" },
        ],
      },
    });
    const second = host.querySelector("li:last-child")!;
    (app.data.items as Array<{ title: string }>)[0].title = "ONE";
    await tick(app);
    expect(host.querySelector("li:last-child")).toBe(second);
    expect([...host.querySelectorAll("li")].map((el) => el.textContent)).toEqual(["ONE", "two"]);
    expect(app.stats().patch).toBe(1);
  });

  it("assigns leaf rank to stable paths and structure rank to t-repeat", () => {
    const { app } = mount({
      template: `<p>{{ name }}</p><li t-repeat="item in items" t-key="item.id">{{ item.name }}</li>`,
      data: { name: "Tee", items: [{ id: 1, name: "a" }] },
    });
    const sites = app.instance.sites;
    const text = sites.find((site) => site.label === "{{ name }}");
    const repeat = sites.find((site) => site.kind === "repeat");
    expect(text?.rank).toBe(Rank.Leaf);
    expect(repeat?.rank).toBe(Rank.Structure);
  });

  it("applies object-literal class maps from compiled IR", async () => {
    const { app, host } = mount({
      template: `<p id="n" t-bind:class="{ notice: urgent }">x</p>`,
      data: { urgent: false },
    });
    const el = host.querySelector("#n")!;
    expect(el.getAttribute("class")).toBeNull();
    app.data.urgent = true;
    await tick(app);
    expect(el.getAttribute("class")).toBe("notice");
  });
});
