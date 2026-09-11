import { describe, expect, it } from "vitest";
import { compileSFC, parseSFC } from "tee";
import Hello from "./fixtures/hello.tee";
import HelloCard from "./fixtures/hello-card.tee";
import { mount, tick } from "./helpers";

describe("Tee SFC", () => {
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

  it("compiles the template to an AST factory at build time", () => {
    const js = compileSFC(`<template><p>{{ n }}</p></template><script>export default { data: () => ({ n: 1 }) }</script>`);
    expect(js).toContain("__ast");
    expect(js).toContain("__mountAST");
    expect(js).toContain('"live"');
    expect(js).not.toContain("innerHTML");
  });

  it("mounts a .tee module without a template string", async () => {
    const { app, host } = mount({ ...Hello });
    expect(host.querySelector(".hi")?.textContent).toBe("你好");
    app.data.msg = "Tee";
    await tick(app);
    expect(host.querySelector(".hi")?.textContent).toBe("Tee");
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
