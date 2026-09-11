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
    expect(writes).toBe(1);
    expect(second.getAttribute("class")).toBe("on");
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
    expect(sites.filter((site) => site.label === "repeat row bindings")).toHaveLength(3);
    expect(sites).toHaveLength(4);
    expect(host.querySelector("tr")?.childNodes).toHaveLength(2);
  });

  it("updates fast row bindings when an item is replaced under the same key", async () => {
    const { app, host } = mount({
      template: `<p t-repeat="item in items" t-key="item.id">{{ item.name }}-{{ index }}</p>`,
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
});
