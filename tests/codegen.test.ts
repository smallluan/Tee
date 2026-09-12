import { describe, expect, it } from "vitest";
import { compileSFC, generateRenderBody, parseHTML } from "tee";

describe("AOT factory codegen", () => {
  it("emits element factories for native trees", () => {
    const body = generateRenderBody(parseHTML(`<div class="box"><span>{{ n }}</span></div>`));
    expect(body).toContain('__rt.el("div"');
    expect(body).toContain('__rt.el("span"');
    expect(body).toContain('__rt.live(');
    expect(body).toContain('__rt.static(_1, "class", "box")');
  });

  it("keeps t-if chains on the runtime walker", () => {
    const body = generateRenderBody(parseHTML(`<p t-if="a">A</p><p t-else>B</p>`));
    expect(body).toContain("__rt.nodes");
    expect(body).toContain('"if"');
  });

  it("emits a TwinMap row factory for native keyed repeats", () => {
    const body = generateRenderBody(
      parseHTML(`<li t-repeat="item in items" t-key="item.id">{{ item.name }}</li>`),
    );
    expect(body).toContain("__rt.rowFactory");
    expect(body).toContain("__rt.repeat");
    expect(body).not.toContain("__rt.mount");
    expect(body).toContain('"item.name"');
  });

  it("falls back to the runtime walker for non-native repeat rows", () => {
    const body = generateRenderBody(parseHTML(`<widget t-repeat="item in items" t-key="item.id"></widget>`));
    expect(body).toContain("__rt.mount");
    expect(body).not.toContain("__rt.rowFactory");
  });

  it("compiles style lang into a Vite CSS query", () => {
    const js = compileSFC(`
      <template><i>x</i></template>
      <style lang="less" scoped>
      @c: red;
      i { color: @c; }
      </style>
      <script>export default {}</script>
    `);
    expect(js).toContain("lang.less");
    expect(js).toContain("type=style");
  });
});
