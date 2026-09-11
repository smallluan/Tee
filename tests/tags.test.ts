import { describe, expect, it } from "vitest";
import { Tee } from "tee";
import { mount } from "./helpers";

describe("nested tags + computed lists", () => {
  it("repeats a computed list inside t-show", () => {
    const { host } = mount({
      template: `<div t-show="ok"><p class="row" t-repeat="item in list">{{ item.name }}</p></div>`,
      data: { items: [{ name: "a" }, { name: "b" }] },
      computed: {
        list() {
          return this.items;
        },
        ok() {
          return (this.list as unknown[]).length > 0;
        },
      },
    });
    expect(host.querySelectorAll(".row").length).toBe(2);
  });

  it("nests custom tags with slots inside t-repeat", () => {
    Tee.define("x-card", {
      template: `<article class="card"><slot name="badge">x</slot><slot></slot></article>`,
    });
    const { host } = mount({
      template: `
        <section t-repeat="group in groups" t-key="group.id">
          <h3>{{ group.name }}</h3>
          <div class="grid">
            <x-card t-repeat="item in group.items" t-key="item.id">
              <template t-slot="badge">¥{{ item.price }}</template>
              <span>{{ item.name }}</span>
            </x-card>
          </div>
        </section>
      `,
      data: {
        groups: [{ id: "a", name: "岩茶", items: [{ id: 1, name: "肉桂", price: 42 }] }],
      },
    });
    expect(host.querySelector(".grid")).not.toBeNull();
    expect(host.querySelector(".card")).not.toBeNull();
    expect(host.textContent).toContain("肉桂");
    expect(host.textContent).toContain("¥42");
  });

  it("combines t-show, computed filter, nested custom cards", () => {
    Tee.define("tea-card-repro", {
      template: `<article class="tea-card"><div class="badge"><slot name="badge"></slot></div><slot></slot></article>`,
    });
    const { host } = mount({
      template: `
        <div t-show="hasMatches">
          <section class="category" t-repeat="category in filtered" t-key="category.id">
            <h3>{{ category.name }}</h3>
            <div class="grid">
              <tea-card-repro t-repeat="tea in category.teas" t-key="tea.id">
                <template t-slot="badge">¥{{ tea.price }}</template>
                <h3>{{ tea.name }}</h3>
              </tea-card-repro>
            </div>
          </section>
        </div>
      `,
      data: {
        query: "",
        menu: [{ id: "rock", name: "岩茶", teas: [{ id: 1, name: "大红袍", price: 68 }] }],
      },
      computed: {
        filtered() {
          const q = String(this.query ?? "").trim();
          const menu = this.menu as Array<{
            id: string;
            name: string;
            teas: Array<{ id: number; name: string; price: number }>;
          }>;
          if (!q) return menu;
          return menu
            .map((category) => ({
              ...category,
              teas: category.teas.filter((tea) => tea.name.includes(q)),
            }))
            .filter((category) => category.teas.length > 0);
        },
        hasMatches() {
          return (this.filtered as unknown[]).length > 0;
        },
      },
    });
    expect(host.querySelector(".category")).not.toBeNull();
    expect(host.querySelector(".tea-card")).not.toBeNull();
    expect(host.textContent).toContain("大红袍");
  });
});
