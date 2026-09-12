import { describe, expect, it, vi, afterEach } from "vitest";
import { observationTarget, intersectsViewport, VIEWPORT_BUFFER_PX } from "../src/tee/materialize";
import { mount, tick } from "./helpers";

function rect(top: number, height = 40): DOMRect {
  return {
    x: 0,
    y: top,
    width: 100,
    height,
    top,
    right: 100,
    bottom: top + height,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("viewport materialization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("observationTarget resolves elements, text, and comments", () => {
    const el = document.createElement("div");
    const text = document.createTextNode("x");
    el.append(text);
    const comment = document.createComment("t-repeat");
    el.append(comment);
    expect(observationTarget(el)).toBe(el);
    expect(observationTarget(text)).toBe(el);
    expect(observationTarget(comment)).toBe(el);
    expect(observationTarget(null)).toBeNull();
  });

  it("defers TwinMap for off-screen sites until promoted", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600, writable: true });
    const nativeRect = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.id === "below" || this.closest("#below")) return rect(900);
      return nativeRect.call(this);
    });

    const app = mount({
      deferViewport: true,
      data: () => ({ off: "hidden-until-visible" }),
      template: '<section id="below"><p>{{ off }}</p></section>',
    });

    await tick(app.app);

    expect(app.host.querySelector("p")?.textContent).toBe("");
    expect(app.app.maps().reverse.length).toBe(0);

    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.id === "below" || this.closest("#below")) return rect(40);
      return nativeRect.call(this);
    });

    app.app.engine.materializer.scheduleSweep();
    await tick(app.app);

    expect(app.host.querySelector("p")?.textContent).toBe("hidden-until-visible");
    expect(app.app.maps().reverse.length).toBeGreaterThan(0);

    app.app.destroy();
  });

  it("materializes in-viewport sites immediately on sweep", async () => {
    const app = mount({
      deferViewport: true,
      data: () => ({ msg: "hello" }),
      template: "<p>{{ msg }}</p>",
    });

    await tick(app.app);

    expect(app.host.querySelector("p")?.textContent).toBe("hello");
    expect(app.app.maps().reverse.length).toBeGreaterThan(0);

    app.app.destroy();
  });

  it("intersectsViewport honors buffer", () => {
    const el = document.createElement("div");
    document.body.append(el);
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(rect(-150, 10));
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600, writable: true });

    expect(intersectsViewport(el, VIEWPORT_BUFFER_PX)).toBe(true);
    expect(intersectsViewport(el, 50)).toBe(false);

    el.remove();
  });
});
