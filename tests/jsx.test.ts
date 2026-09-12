import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileTSX, compileTSXWithMap, isSFCSource } from "../src/tee/jsx-transform";
import { mount, tick } from "./helpers";
import { setup, computed } from "../src/tee/chart";
import { jsx, Fragment, For } from "../src/tee/jsx";

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

  it("binds For from jsx-runtime when the tag is used without an import", () => {
    const js = compileTSX(
      `import { setup } from "tee-framework";
export default setup(function App(self) {
  return <For each={self.items} by="id">{(item) => <li>{item.name}</li>}</For>;
});`,
      "App.tee",
    );
    expect(js).toMatch(/\{[^}]*\bFor\b[^}]*\}\s*from "tee-framework\/jsx-runtime"/);
    expect(js).toContain("_jsx(For,");
  });

  it("keeps an existing For import and still emits the component call", () => {
    const js = compileTSX(
      `import { setup, For } from "tee-framework";
export default setup(function App(self) {
  return <For each={self.items}>{(item) => <li>{item.name}</li>}</For>;
});`,
      "App.tee",
    );
    expect(js).toContain('import { setup, For } from "tee-framework"');
    expect(js.match(/\bFor\b/g)?.length).toBeGreaterThan(1);
  });

  it("keeps t-on and t-model modifiers as one attribute name", () => {
    const js = compileTSX(
      `import { setup } from "tee-framework";
export default setup(function App(self) {
  return (
    <form t-on:submit.prevent={() => self.save()}>
      <input t-model.trim="guest" />
      <a t-on:click.prevent.stop={() => self.go()}>go</a>
    </form>
  );
});`,
      "App.tee",
    );
    expect(js).toContain('"t-on:submit.prevent"');
    expect(js).toContain('"t-model.trim"');
    expect(js).toContain('"t-on:click.prevent.stop"');
    expect(js).not.toMatch(/"t-on:submit":\s*true/);
    expect(js).not.toMatch(/\bprevent:\s*\(\)\s*=>/);
  });

  it("emits a source map that points at the .tee file", () => {
    const { map } = compileTSXWithMap(
      `export default setup((self) => {
  return <p>{self.title}</p>;
});`,
      "src/App.tee",
    );
    expect(map).toMatchObject({ file: "src/App.tee" });
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

describe("TSX types", () => {
  it("treats JSX children and child-component props as a bag, not Self", () => {
    const Chip = setup(function Chip(self) {
      return jsx("span", { children: self.value });
    });
    const props: Parameters<typeof Chip>[0] = { value: "茶" };
    expect(Chip.name).toBe("Chip");
    expect(props?.value).toBe("茶");
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

  it("uses the function name as the component name", async () => {
    const Chip = setup(function Chip(self) {
      return jsx("span", { class: "chip", children: () => self.label });
    });
    expect(Chip.name).toBe("Chip");
    const { app, host } = mount({
      ...setup(function App(self) {
        self.label = "茶";
        return jsx("main", {
          children: jsx(Chip, { label: () => self.label }),
        });
      }),
    });
    expect(host.querySelector(".chip")?.textContent).toBe("茶");
    app.data.label = "岩";
    await tick(app);
    expect(host.querySelector(".chip")?.textContent).toBe("岩");
  });

  it("repeats and reorders rows through For", async () => {
    const { app, host } = mount({
      ...setup((self) => {
        self.items = [
          { id: 1, name: "龙井" },
          { id: 2, name: "岩茶" },
        ];
        return jsx("ul", {
          children: For({
            each: () => self.items as Array<{ id: number; name: string }>,
            by: "id",
            children: (item) => jsx("li", { children: () => item.name }),
          }),
        });
      }),
    });
    expect([...host.querySelectorAll("li")].map((el) => el.textContent)).toEqual(["龙井", "岩茶"]);
    app.data.items = [
      { id: 2, name: "岩茶" },
      { id: 3, name: "铁观音" },
    ];
    await tick(app);
    expect([...host.querySelectorAll("li")].map((el) => el.textContent)).toEqual(["岩茶", "铁观音"]);
  });

  it("lets self.view be user state, not the setup return slot", async () => {
    const { app, host } = mount({
      ...setup((self) => {
        self.view = "a";
        return jsx("main", {
          children: [
            jsx("p", { "t-if": () => self.view === "a", children: "page-a" }),
            jsx("p", { "t-else": true, children: "page-b" }),
            jsx("button", {
              "t-on:click": () => {
                self.view = "b";
              },
              children: "go",
            }),
          ],
        });
      }),
    });
    expect(host.textContent).toContain("page-a");
    host.querySelector("button")!.dispatchEvent(new Event("click"));
    await tick(app);
    expect(host.textContent).toContain("page-b");
  });

  it("honors t-on:submit.prevent on the real node", async () => {
    const { host } = mount({
      ...setup((self) => {
        self.saved = false;
        return jsx("form", {
          "t-on:submit.prevent": () => {
            self.saved = true;
          },
          children: jsx("button", { type: "submit", children: "ok" }),
        });
      }),
    });
    const form = host.querySelector("form")!;
    const event = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
