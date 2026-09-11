import { describe, expect, it } from "vitest";
import { parseHTML } from "tee";

describe("HTML parser", () => {
  it("splits interpolations and Tee directives", () => {
    const ast = parseHTML(`<p t-show="on" class="x">Hello {{ name }}</p>`);
    expect(ast).toHaveLength(1);
    const el = ast[0];
    expect(el.t).toBe("el");
    if (el.t !== "el") return;
    expect(el.tag).toBe("p");
    expect(el.attrs).toEqual(
      expect.arrayContaining([
        { kind: "show", value: "on" },
        { kind: "static", name: "class", value: "x" },
      ]),
    );
    expect(el.children).toEqual([
      { t: "text", value: "Hello " },
      { t: "live", src: "name" },
    ]);
  });

  it("keeps nested template slot fillers", () => {
    const ast = parseHTML(`<x-card><template t-slot="title">{{ t }}</template><span>b</span></x-card>`);
    const el = ast[0];
    expect(el.t).toBe("el");
    if (el.t !== "el") return;
    expect(el.children[0].t).toBe("el");
    if (el.children[0].t !== "el") return;
    expect(el.children[0].tag).toBe("template");
    expect(el.children[0].attrs).toContainEqual({ kind: "slot", value: "title" });
  });
});
