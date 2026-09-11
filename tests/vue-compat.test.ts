import { describe, expect, it } from "vitest";
import { Tee } from "tee";
import { mount, tick } from "./helpers";

describe("Vue-compatible basics", () => {
  it("switches t-if / t-else-if / t-else branches", async () => {
    const { app, host } = mount({
      template: `
        <p t-if="mode === 'a'" id="a">A</p>
        <p t-else-if="mode === 'b'" id="b">B</p>
        <p t-else id="c">C</p>
      `,
      data: { mode: "a" },
    });
    expect(host.querySelector("#a")?.textContent).toBe("A");
    expect(host.querySelector("#b")).toBeNull();
    app.data.mode = "b";
    await tick(app);
    expect(host.querySelector("#b")?.textContent).toBe("B");
    expect(host.querySelector("#a")).toBeNull();
    app.data.mode = "z";
    await tick(app);
    expect(host.querySelector("#c")?.textContent).toBe("C");
  });

  it("binds html, class arrays, and style objects", async () => {
    const { app, host } = mount({
      template: `<div id="x" t-html="html" t-bind:class="cls" t-bind:style="css"></div>`,
      data: {
        html: "<b>岩</b>",
        cls: ["one", { two: true, three: false }],
        css: { color: "red", fontSize: "12px" },
      },
    });
    const el = host.querySelector("#x")!;
    expect(el.innerHTML).toBe("<b>岩</b>");
    expect(el.getAttribute("class")).toContain("one");
    expect(el.getAttribute("class")).toContain("two");
    expect(el.getAttribute("style")).toContain("color:red");
    app.data.html = "<i>茶</i>";
    await tick(app);
    expect(el.innerHTML).toBe("<i>茶</i>");
  });

  it("passes props and emits to the parent", async () => {
    const seen: unknown[] = [];
    Tee.define("x-prop", {
      props: ["title"],
      template: `<button t-on:click="$emit('save', title)">{{ title }}</button>`,
    });
    const { host } = mount({
      template: `<x-prop t-bind:title="name" t-on:save="onSave"></x-prop>`,
      data: { name: "肉桂" },
      methods: {
        onSave(value: unknown) {
          seen.push(value);
        },
      },
    });
    expect(host.querySelector("button")?.textContent).toBe("肉桂");
    host.querySelector("button")!.dispatchEvent(new Event("click"));
    expect(seen).toEqual(["肉桂"]);
  });

  it("records t-ref and runs mounted / nextTick", async () => {
    let mounted = false;
    const { app } = mount({
      template: `<input t-ref="box" t-model="q" />`,
      data: { q: "茶" },
      mounted() {
        mounted = true;
        const box = (this as { $refs: { box: HTMLInputElement } }).$refs.box;
        expect(box.value).toBe("茶");
      },
    });
    expect(mounted).toBe(true);
    await Tee.nextTick();
    expect(app.data.q).toBe("茶");
  });

  it("provides and injects across a child tag", () => {
    Tee.define("x-leaf", {
      inject: ["tone"],
      template: `<span id="leaf">{{ tone }}</span>`,
    });
    const { host } = mount({
      template: `<x-leaf></x-leaf>`,
      provide: { tone: "岩骨" },
    });
    expect(host.querySelector("#leaf")?.textContent).toBe("岩骨");
  });

  it("applies t-model.number", async () => {
    const { app, host } = mount({
      template: `<input id="n" t-model.number="qty" />`,
      data: { qty: 2 },
    });
    const input = host.querySelector("#n") as HTMLInputElement;
    input.value = "5";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick(app);
    expect(app.data.qty).toBe(5);
  });

  it("aliases t-for and merges class objects with static class", async () => {
    const { app, host } = mount({
      template: `<p class="base" t-bind:class="cls" t-for="n in nums">{{ n }}</p>`,
      data: { cls: { on: true }, nums: [1, 2] },
    });
    const items = host.querySelectorAll("p");
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute("class")).toContain("base");
    expect(items[0].getAttribute("class")).toContain("on");
    app.data.cls = { on: false };
    await tick(app);
    expect(host.querySelector("p")?.getAttribute("class")).toBe("base");
  });

  it("freezes t-once after the first bind", async () => {
    const { app, host } = mount({
      template: `<p t-once>{{ name }}</p>`,
      data: { name: "岩" },
    });
    expect(host.querySelector("p")?.textContent).toBe("岩");
    app.data.name = "茶";
    await tick(app);
    expect(host.querySelector("p")?.textContent).toBe("岩");
  });

  it("spreads t-bind objects and uses inject defaults", () => {
    Tee.define("x-fallback", {
      inject: { tone: { default: "默认岩" } },
      template: `<span id="fb" t-bind="attrs">{{ tone }}</span>`,
      data: () => ({ attrs: { title: "chip" } }),
    });
    const { host } = mount({
      template: `<x-fallback></x-fallback>`,
    });
    const el = host.querySelector("#fb")!;
    expect(el.textContent).toBe("默认岩");
    expect(el.getAttribute("title")).toBe("chip");
  });

  it("honors click.prevent", () => {
    const { host } = mount({
      template: `<a id="go" href="#nope" t-on:click.prevent="hit = true">go</a>`,
      data: { hit: false },
    });
    const ev = new Event("click", { bubbles: true, cancelable: true });
    host.querySelector("#go")!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
