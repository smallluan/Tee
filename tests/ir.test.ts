import { describe, expect, it } from "vitest";
import { compileExpr, compileStmt, evalIR, Rank, rankOf } from "tee";

const get = (name: string) =>
  (
    ({
      count: 3,
      item: { id: 9, price: 42 },
      openFaq: 1,
      guest: "岩",
      urgent: true,
      cart: [{ price: 10 }, { price: 5 }],
      form: { email: "a@b.c", agree: true },
    }) as Record<string, unknown>
  )[name];

describe("Tee IR", () => {
  it("compiles paths, compares, and ternary without with()", () => {
    const path = compileExpr("item.id");
    expect(path.ir).not.toBeNull();
    expect(path.stable).toBe(true);
    expect(path.run).not.toBeNull();
    expect(evalIR(path.ir!, get)).toBe(9);
    expect(path.run!(get)).toBe(9);

    const cmp = compileExpr("count > 3");
    expect(cmp.run!(get)).toBe(false);

    const cond = compileExpr("openFaq === item.id ? 0 : item.id");
    expect(cond.stable).toBe(false);
    expect(cond.run!(get)).toBe(9);
  });

  it("compiles assignments used by t-on", () => {
    const plan = compileStmt("count = count + 1");
    expect(plan.t).toBe("assign");
    if (plan.t === "assign") {
      expect(plan.path).toEqual(["count"]);
      expect(plan.run(get)).toBe(4);
    }
  });

  it("compiles object literals, index access, and arrows", () => {
    const obj = compileExpr("{ notice: urgent }");
    expect(obj.ir).not.toBeNull();
    expect(obj.stable).toBe(true);
    expect(obj.run!(get)).toEqual({ notice: true });

    const idx = compileExpr("cart[0].price");
    expect(idx.stable).toBe(true);
    expect(idx.run!(get)).toBe(10);

    const sum = compileExpr("cart.reduce((s, x) => s + x.price, 0)");
    expect(sum.ir).not.toBeNull();
    expect(sum.stable).toBe(false);
    expect(sum.run!(get)).toBe(15);
  });

  it("compiles method calls used by bind expressions", () => {
    const plan = compileExpr("form.email.trim()");
    expect(plan.run!(get)).toBe("a@b.c");
    const can = compileExpr("form.email.trim() && form.agree");
    expect(can.stable).toBe(false);
    expect(can.run!(get)).toBe(true);
  });

  it("classifies ranks from expression stability", () => {
    expect(rankOf("text", compileExpr("guest").stable)).toBe(Rank.Leaf);
    expect(rankOf("text", compileExpr("guest || '访客'").stable)).toBe(Rank.Expr);
    expect(rankOf("computed", false)).toBe(Rank.Derived);
    expect(rankOf("watch", true)).toBe(Rank.Watch);
    expect(rankOf("repeat", true)).toBe(Rank.Structure);
  });
});
