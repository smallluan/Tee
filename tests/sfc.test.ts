import { describe, expect, it } from "vitest";
import { compileSFC, parseSFC, scopeCss } from "tee";
import Hello from "./fixtures/hello.tee";
import HelloCard from "./fixtures/hello-card.tee";
import RepeatList from "./fixtures/repeat-list.tee";
import { mount, tick } from "./helpers";

describe("Tee SFC", () => {
  it("scopes selectors after Less variables", () => {
    const css = scopeCss(`@gold: #b8893a;\n.chip { color: @gold; }`, "data-t-x");
    expect(css).toContain(".chip[data-t-x]");
    expect(css).toContain("@gold: #b8893a;");
  });

  it("parses nested template blocks used by t-slot", () => {
    const sfc = parseSFC(`
      <template>
        <box>
          <template t-slot="title">{{ t }}</template>
          body
        </box>
      </template>
      <script>
      export default { data: () => ({ t: "A" }) }
      </script>
    `);
    expect(sfc.template).toContain("t-slot");
    expect(sfc.template).toContain("{{ t }}");
    expect(sfc.script).toContain("export default");
  });

  it("compiles native HTML to createElement factories", () => {
    const js = compileSFC(`<template><p>{{ n }}</p></template><script>export default { data: () => ({ n: 1 }) }</script>`);
    expect(js).toContain("__rt.el");
    expect(js).toContain("__rt.live");
    expect(js).toContain('"n"');
    expect(js).not.toContain("__ast");
    expect(js).not.toContain("innerHTML");
  });

  it("mounts a .tee module without a template string", async () => {
    const { app, host } = mount({ ...Hello });
    expect(host.querySelector(".hi")?.textContent).toBe("你好");
    app.data.msg = "Tee";
    await tick(app);
    expect(host.querySelector(".hi")?.textContent).toBe("Tee");
  });

  it("compiles keyed repeats to TwinMap row factories", async () => {
    expect(typeof RepeatList.render).toBe("function");
    const { app, host } = mount({ ...RepeatList });
    const before = [...host.querySelectorAll("li")];
    expect(before.map((node) => node.textContent)).toEqual(["a", "b", "c"]);

    (app.data.items as Array<{ id: number; name: string }>)[1].name = "B";
    await tick(app);

    expect([...host.querySelectorAll("li")]).toEqual(before);
    expect(before.map((node) => node.textContent)).toEqual(["a", "B", "c"]);
    expect(app.stats().mark).toBe(1);
    expect(app.stats().run).toBe(1);
    expect(app.stats().patch).toBe(1);
  });

  it("compiles the official App.tee module", async () => {
    const App = (await import("../src/demo/App.tee")).default;
    expect(typeof App.render).toBe("function");
    expect(typeof App.data).toBe("function");
    expect(typeof App.computed?.invoiceTotal).toBe("function");
  });

  it("registers a custom tag from the SFC tag field", () => {
    expect(HelloCard.tag).toBe("hello-card");
    const { host } = mount({
      template: `<hello-card><template t-slot="title">岩茶</template>肉桂</hello-card>`,
      data: {},
    });
    expect(host.querySelector("header")?.textContent).toBe("岩茶");
    expect(host.querySelector(".body")?.textContent).toBe("肉桂");
  });
});
