import { describe, expect, it } from "vitest";
import {
  Tee,
  setup,
  computed,
  watch,
  watchEffect,
  onMounted,
  onUnmounted,
  ref,
  type Ctx,
} from "tee";
import { mount, tick } from "./helpers";

function useCounter(c: Ctx) {
  c.n = 0;
  c.bump = () => {
    c.n = Number(c.n) + 1;
  };
}

describe("setup uses familiar words on one shared object", () => {
  it("assigns fields, computed, and methods that the template already knows", async () => {
    const { app, host } = mount({
      template: `<button t-on:click="bump">{{ label }}</button>`,
      setup(c) {
        c.n = 1;
        c.label = computed(() => `×${Number(c.n) * 2}`);
        c.bump = () => {
          c.n = Number(c.n) + 1;
        };
      },
    });
    expect(host.querySelector("button")?.textContent).toBe("×2");
    host.querySelector("button")!.dispatchEvent(new Event("click"));
    await tick(app);
    expect(host.querySelector("button")?.textContent).toBe("×4");
    expect(app.data.n).toBe(2);
  });

  it("runs watch after the source changes, not as a renamed trail", async () => {
    const seen: unknown[] = [];
    const { app } = mount({
      template: `<span>{{ n }}</span>`,
      setup(c) {
        c.n = 0;
        watch(
          () => c.n,
          (n) => {
            seen.push(n);
          },
        );
      },
    });
    expect(seen).toEqual([]);
    app.data.n = 3;
    await tick(app);
    expect(seen).toEqual([3]);
  });

  it("supports watch(..., { immediate: true })", async () => {
    const seen: unknown[] = [];
    const { app } = mount({
      template: `<span>{{ n }}</span>`,
      setup(c) {
        c.n = 0;
        watch(
          () => c.n,
          (n) => {
            seen.push(n);
          },
          { immediate: true },
        );
      },
    });
    expect(seen).toEqual([0]);
    app.data.n = 3;
    await tick(app);
    expect(seen).toEqual([0, 3]);
  });

  it("calls onMounted after the real DOM is linked and onUnmounted when destroyed", () => {
    const log: string[] = [];
    const { app } = mount({
      template: `<p>x</p>`,
      setup() {
        onMounted(() => log.push("mounted"));
        onUnmounted(() => log.push("unmounted"));
      },
    });
    expect(log).toEqual(["mounted"]);
    app.destroy();
    expect(log).toEqual(["mounted", "unmounted"]);
  });

  it("runs watchEffect immediately, then again when it re-reads", async () => {
    const seen: unknown[] = [];
    const { app } = mount({
      template: `<span>{{ n }}</span>`,
      setup(c) {
        c.n = 0;
        watchEffect(() => {
          seen.push(c.n);
        });
      },
    });
    expect(seen).toEqual([0]);
    app.data.n = 3;
    await tick(app);
    expect(seen).toEqual([0, 3]);
  });

  it("lets a composable write onto the same object the template reads", async () => {
    const { app, host } = mount({
      template: `<button t-on:click="bump">{{ n }}</button>`,
      setup(c) {
        useCounter(c);
      },
    });
    expect(host.textContent).toBe("0");
    host.querySelector("button")!.dispatchEvent(new Event("click"));
    await tick(app);
    expect(host.textContent).toBe("1");
  });

  it("still accepts Vue-style ref() + return, then unwraps onto that same object", async () => {
    const { app, host } = mount({
      template: `<button t-on:click="bump">{{ n }}</button>`,
      setup() {
        const n = ref(4);
        const bump = () => {
          n.value = Number(n.value) + 1;
        };
        return { n, bump };
      },
    });
    expect(host.querySelector("button")?.textContent).toBe("4");
    host.querySelector("button")!.dispatchEvent(new Event("click"));
    await tick(app);
    expect(host.querySelector("button")?.textContent).toBe("5");
    expect(app.data.n).toBe(5);
  });

  it("exports setup() as a tag definition", async () => {
    Tee.define(
      "x-bump",
      setup({
        tag: "x-bump",
        template: `<em t-on:click="bump">{{ n }}</em>`,
        setup(c) {
          c.n = 4;
          c.bump = () => {
            c.n = Number(c.n) + 1;
          };
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

  it("keeps Options API working on the same object", async () => {
    const { app, host } = mount({
      template: `<p>{{ doubled }}</p>`,
      data: () => ({ n: 2 }),
      computed: {
        doubled() {
          return Number(this.n) * 2;
        },
      },
    });
    expect(host.textContent).toBe("4");
    app.data.n = 5;
    await tick(app);
    expect(host.textContent).toBe("10");
  });
});
