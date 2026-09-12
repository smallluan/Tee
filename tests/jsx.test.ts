import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileTSX, isSFCSource } from "../src/tee/jsx-transform";
import { mount, tick } from "./helpers";
import { setup, computed } from "../src/tee/chart";
import { jsx, Fragment } from "../src/tee/jsx";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

describe("TSX compile", () => {
  it("detects Vue-style SFC vs TSX modules", () => {
    expect(isSFCSource("<template></template>\n<script></script>")).toBe(true);
    expect(
      isSFCSource(`import { setup } from "tee-framework";
export default setup((self) => {
  return <main>{self.title}</main>;
});`),
    ).toBe(false);
  });

  it("wraps dynamic JSX values as getters and emits the Tee jsx runtime", () => {
    const js = compileTSX(
      `export default setup((self) => {
  return <p t-if={self.count === 0} class="ok">{self.title}</p>;
});`,
      "App.tee",
    );
    expect(js).toContain("tee-framework/jsx-runtime");
    expect(js).toContain("() => (self.count === 0)");
    expect(js).toContain("() => (self.title)");
    expect(js).toContain('class: "ok"');
    expect(js).not.toMatch(/t-if:\s*true/);
    expect(js).toContain("children:");
  });

  it("compiles the starter App.tee without eating children or handlers", () => {
    const src = readFileSync(join(root, "templates/starter/src/App.tee"), "utf8");
    const js = compileTSX(src, "App.tee");
    expect(js).toContain("tee-framework/jsx-runtime");
    expect(js).toContain("() => (self.title)");
    expect(js).toContain("() => (self.guest || \"访客\")");
    expect(js).toContain("t-on:click");
    expect(js).toContain("import \"./App.less\"");
  });
});

describe("setup returns DOM", () => {
  it("patches text and t-if without a template block", async () => {
    const { app, host } = mount({
      ...setup((self) => {
        self.count = 0;
        self.label = computed(() => `n=${self.count}`);
        return jsx("main", {
          children: [
            jsx("span", { children: () => self.label }),
            jsx("p", { "t-if": () => self.count === 0, children: "empty" }),
            jsx("p", { "t-else": true, children: () => self.count }),
            jsx("button", {
              "t-on:click": () => {
                self.count = Number(self.count) + 1;
              },
              children: "bump",
            }),
          ],
        });
      }),
    });

    expect(host.querySelector("span")?.textContent).toBe("n=0");
    expect(host.querySelector("p")?.textContent).toBe("empty");

    host.querySelector("button")!.dispatchEvent(new Event("click"));
    await tick(app);

    expect(host.querySelector("span")?.textContent).toBe("n=1");
    expect(host.querySelector("p")?.textContent).toBe("1");
    void Fragment;
  });

  it("mounts a named child from define() or the imported TagDef", async () => {
    const Chip = setup({
      tag: "demo-chip",
      setup(self) {
        return jsx("span", { class: "chip", children: () => self.label });
      },
    });
    const { app, host } = mount({
      ...setup((self) => {
        self.label = "茶";
        return jsx("main", {
          children: [
            jsx(Chip, { label: () => self.label }),
            jsx("demo-chip", { label: () => `再${self.label}` }),
          ],
        });
      }),
    });
    const chips = host.querySelectorAll(".chip");
    expect(chips[0]?.textContent).toBe("茶");
    expect(chips[1]?.textContent).toBe("再茶");

    app.data.label = "岩";
    await tick(app);
    expect(chips[0]?.textContent).toBe("岩");
    expect(chips[1]?.textContent).toBe("再岩");
    expect(Chip.tag).toBe("demo-chip");
  });
});
