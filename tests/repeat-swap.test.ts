import { describe, expect, it } from "vitest";
import { mount, tick } from "./helpers";

describe("keyed t-repeat", () => {
  it("swaps two rows in place without rebuilding the nodes", async () => {
    const { app, host } = mount({
      template: `<li t-repeat="item in items" t-key="item.id">{{ item.name }}</li>`,
      data: {
        items: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
          { id: 3, name: "c" },
        ],
      },
    });
    const before = [...host.querySelectorAll("li")];
    expect(before.map((el) => el.textContent)).toEqual(["a", "b", "c"]);

    const items = app.data.items as Array<{ id: number; name: string }>;
    const tmp = items[0];
    items[0] = items[2];
    items[2] = tmp;
    await tick(app);

    const after = [...host.querySelectorAll("li")];
    expect(after.map((el) => el.textContent)).toEqual(["c", "b", "a"]);
    expect(after[0]).toBe(before[2]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[0]);
  });

  it("moves only the rows outside the keyed LIS", async () => {
    const { app, host } = mount({
      template: `<li t-repeat="item in items" t-key="item.id">{{ item.name }}</li>`,
      data: {
        items: Array.from({ length: 1000 }, (_, i) => ({ id: i, name: String(i) })),
      },
    });
    const original = host.insertBefore.bind(host);
    let inserts = 0;
    host.insertBefore = ((node: Node, child: Node | null) => {
      inserts += 1;
      return original(node, child);
    }) as typeof host.insertBefore;

    const items = app.data.items as Array<{ id: number; name: string }>;
    const tmp = items[1];
    items[1] = items[998];
    items[998] = tmp;
    await tick(app);

    expect([...host.querySelectorAll("li")].map((el) => el.textContent)).toEqual(
      items.map((item) => item.name),
    );
    expect(inserts).toBe(2);
  });

  it("batches a contiguous append into one DOM insertion", async () => {
    const { app, host } = mount({
      template: `<li t-repeat="item in items" t-key="item.id">{{ item.name }}</li>`,
      data: {
        items: Array.from({ length: 10 }, (_, i) => ({ id: i, name: String(i) })),
      },
    });
    const original = host.insertBefore.bind(host);
    let inserts = 0;
    host.insertBefore = ((node: Node, child: Node | null) => {
      inserts += 1;
      return original(node, child);
    }) as typeof host.insertBefore;

    const items = app.data.items as Array<{ id: number; name: string }>;
    items.push(...Array.from({ length: 10 }, (_, i) => ({ id: i + 10, name: String(i + 10) })));
    await tick(app);

    expect(host.querySelectorAll("li")).toHaveLength(20);
    expect(inserts).toBe(1);
  });

  it("does not invalidate index-independent row sites after a removal", async () => {
    const { app, host } = mount({
      template: `<li t-repeat="item in items" t-key="item.id">{{ item.name }}</li>`,
      data: {
        items: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
          { id: 3, name: "c" },
          { id: 4, name: "d" },
        ],
      },
    });

    (app.data.items as Array<{ id: number; name: string }>).splice(0, 1);
    await tick(app);

    expect([...host.querySelectorAll("li")].map((el) => el.textContent)).toEqual(["b", "c", "d"]);
    expect(app.stats().run).toBe(1);
  });

  it("still invalidates shifted rows whose bindings read the repeat index", async () => {
    const { app, host } = mount({
      template: `<li t-repeat="item in items" t-key="item.id">{{ item.name }}-{{ $index }}</li>`,
      data: {
        items: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
          { id: 3, name: "c" },
        ],
      },
    });

    (app.data.items as Array<{ id: number; name: string }>).splice(0, 1);
    await tick(app);

    expect([...host.querySelectorAll("li")].map((el) => el.textContent)).toEqual(["b-0", "c-1"]);
    expect(app.stats().run).toBe(3);
  });

  it("still swaps in place after the list is replaced", async () => {
    const { app, host } = mount({
      template: `<li t-repeat="item in items" t-key="item.id">{{ item.name }}</li>`,
      data: {
        items: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
          { id: 3, name: "c" },
        ],
      },
    });
    app.data.items = [
      { id: 4, name: "d" },
      { id: 5, name: "e" },
      { id: 6, name: "f" },
    ];
    await tick(app);
    const before = [...host.querySelectorAll("li")];
    expect(before.map((el) => el.textContent)).toEqual(["d", "e", "f"]);

    const items = app.data.items as Array<{ id: number; name: string }>;
    const tmp = items[0];
    items[0] = items[2];
    items[2] = tmp;
    await tick(app);

    const after = [...host.querySelectorAll("li")];
    expect(after.map((el) => el.textContent)).toEqual(["f", "e", "d"]);
    expect(after[0]).toBe(before[2]);
    expect(after[2]).toBe(before[0]);
  });

  it("does not rewrite class when the class string is unchanged", async () => {
    const { app, host } = mount({
      template: `<p t-repeat="item in items" t-key="item.id" t-bind:class="{ on: item.id === selected }">{{ item.id }}</p>`,
      data: {
        selected: 1,
        items: [
          { id: 1 },
          { id: 2 },
          { id: 3 },
        ],
      },
    });
    const second = host.querySelectorAll("p")[1];
    const orig = second.setAttribute.bind(second);
    let writes = 0;
    second.setAttribute = ((name: string, value: string) => {
      writes += 1;
      orig(name, value);
    }) as typeof second.setAttribute;

    app.data.selected = 1;
    await tick(app);
    expect(writes).toBe(0);

    app.data.selected = 2;
    await tick(app);
    expect(second.getAttribute("class")).toBe("on");
    expect(app.maps().reverse.filter((site) => site.label === "keyed class selected")).toHaveLength(1);
  });

  it("groups native row bindings into one reactive site per row", () => {
    const { app, host } = mount({
      template:
        `<table><tbody><tr t-repeat="item in items" t-key="item.id" ` +
        `t-bind:class="{ on: item.id === selected }">\n` +
        `  <td>{{ item.id }}</td>\n  <td>{{ item.name }}</td>\n</tr></tbody></table>`,
      data: {
        selected: 1,
        items: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
          { id: 3, name: "c" },
        ],
      },
    });

    const sites = app.maps().reverse;
    const rowSites = sites.filter((site) => site.label === "repeat row bindings");
    expect(rowSites).toHaveLength(3);
    expect(rowSites.every((site) => !site.debugProps.includes("item"))).toBe(true);
    expect(sites.filter((site) => site.label === "keyed class selected")).toHaveLength(1);
    expect(sites).toHaveLength(5);
    expect(host.querySelector("tr")?.childNodes).toHaveLength(2);
    expect(host.querySelector("td")?.childNodes).toHaveLength(1);
  });

  it("keeps direct item writes point-to-point through TwinMap", async () => {
    const { app, host } = mount({
      template: `<p t-repeat="item in items" t-key="item.id">{{ item.name }}</p>`,
      data: {
        items: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
          { id: 3, name: "c" },
        ],
      },
    });
    const before = [...host.querySelectorAll("p")];

    (app.data.items as Array<{ id: number; name: string }>)[1].name = "B";
    await tick(app);

    expect([...host.querySelectorAll("p")]).toEqual(before);
    expect(before.map((node) => node.textContent)).toEqual(["a", "B", "c"]);
    expect(app.stats().mark).toBe(1);
    expect(app.stats().run).toBe(1);
    expect(app.stats().patch).toBe(1);
  });

  it("preserves meaningful whitespace between inline children", () => {
    const { host } = mount({
      template:
        `<p t-repeat="item in items" t-key="item.id">` +
        `<span>{{ item.first }}</span> <span>{{ item.last }}</span></p>`,
      data: { items: [{ id: 1, first: "Ada", last: "Lovelace" }] },
    });

    expect(host.querySelector("p")?.textContent).toBe("Ada Lovelace");
  });

  it("updates fast row bindings when an item is replaced under the same key", async () => {
    const { app, host } = mount({
      template: `<p t-repeat="item in items" t-key="item.id">{{ item.name }}-{{ $index }}</p>`,
      data: {
        items: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ],
      },
    });
    const before = host.querySelectorAll("p")[0];

    (app.data.items as Array<{ id: number; name: string }>)[0] = { id: 1, name: "next" };
    await tick(app);

    expect(host.querySelectorAll("p")[0]).toBe(before);
    expect(before.textContent).toBe("next-0");
  });

  it("falls back to tracked expressions for nullable nested item paths", async () => {
    const { app, host } = mount({
      template: `<p t-repeat="item in items" t-key="item.id">{{ item.user.name }}</p>`,
      data: { items: [{ id: 1, user: null }] },
    });
    expect(host.querySelector("p")?.textContent).toBe("");

    (app.data.items as Array<{ id: number; user: { name: string } | null }>)[0].user = { name: "Ada" };
    await tick(app);

    expect(host.querySelector("p")?.textContent).toBe("Ada");
  });
});
