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
});
