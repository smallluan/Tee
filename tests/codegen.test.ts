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
