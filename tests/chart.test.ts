import { describe, expect, it } from "vitest";
import { Tee, weave } from "tee";
import type { Chart } from "tee";
import { mount, tick } from "./helpers";

function counter(c: Chart) {
  c.hold({ n: 0 });
  c.act("bump", () => {
    c.n = Number(c.n) + 1;
  });
}

describe("Tee weave (chart composition)", () => {
  it("holds slots, derives names, and fires acts from the template", async () => {
    const { app, host } = mount({
      template: `<button t-on:click="bump">{{ label }}</button>`,
      weave(c) {
        c.hold({ n: 1 });
        c.derive("label", () => `×${Number(c.n) * 2}`);
        c.act("bump", () => {
          c.n = Number(c.n) + 1;
        });
      },
    });
    expect(host.querySelector("button")?.textContent).toBe("×2");
    host.querySelector("button")!.dispatchEvent(new Event("click"));
    await tick(app);
    expect(host.querySelector("button")?.textContent).toBe("×4");
    expect(app.data.n).toBe(2);
  });

  it("follows slots with a trail site (no DOM)", async () => {
    const seen: unknown[] = [];
    const { app } = mount({
      template: `<span>{{ n }}</span>`,
      weave(c) {
        c.hold({ n: 0 });
        c.trail("log", () => {
          seen.push(c.n);
        });
      },
    });
    expect(seen).toEqual([0]);
    app.data.n = 3;
    await tick(app);
    expect(seen).toEqual([0, 3]);
  });

  it("pins after the real DOM is linked and unpins when unlinked", () => {
    const log: string[] = [];
    const { app } = mount({
      template: `<p>x</p>`,
      weave(c) {
        c.pin(() => log.push("pin"));
        c.unpin(() => log.push("unpin"));
      },
    });
    expect(log).toEqual(["pin"]);
    app.destroy();
    expect(log).toEqual(["pin", "unpin"]);
  });

  it("nests weaves into the same ledger", async () => {
    const { app, host } = mount({
      template: `<button t-on:click="bump">{{ n }}</button>`,
      weave(c) {
        c.weave(counter);
      },
    });
    expect(host.textContent).toBe("0");
    host.querySelector("button")!.dispatchEvent(new Event("click"));
    await tick(app);
    expect(host.textContent).toBe("1");
  });

  it("exports weave() as a tag definition", async () => {
    Tee.define(
      "x-bump",
      weave({
        tag: "x-bump",
        template: `<em t-on:click="bump">{{ n }}</em>`,
        install(c) {
          c.hold({ n: 4 });
          c.act("bump", () => {
            c.n = Number(c.n) + 1;
          });
        },
      }),
    );
    const { app, host } = mount({
      template: `<x-bump></x-bump>`,
    });
    expect(host.querySelector("em")?.textContent).toBe("4");
    host.querySelector("em")!.dispatchEvent(new Event("click"));
    await tick(app);
    expect(host.querySelector("em")?.textContent).toBe("5");
  });
});
