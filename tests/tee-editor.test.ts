import { describe, expect, it } from "vitest";
import { createTeeLanguageProject } from "../src/tee/tee-lsp";
import {
  collectComponentBindings,
  extractBindings,
  findTemplateExprs,
  locateTee,
  parseSFCBlocks,
  virtualizeTee,
} from "../src/tee/tee-virtual";

const setupSfc = `<template>
  <p t-if="count === 0">{{ guest || "访客" }}</p>
  <button t-on:click="bump">{{ count }}</button>
</template>

<script lang="ts">
import { setup, computed, watch, onMounted } from "tee-framework";

export default setup((self) => {
  self.guest = "";
  self.count = 0;
  self.bump = () => {
    self.count = Number(self.count) + 1;
  };
  self.label = computed(() => String(self.count));
});
</script>
`;

const optionsSfc = `<template>
  <span>{{ title }}</span>
</template>
<script lang="ts">
export default {
  data: () => ({
    title: "hello",
    count: 1,
  }),
  computed: {
    doubled() {
      return this.count * 2;
    },
  },
  methods: {
    bump() {
      this.count += 1;
    },
  },
};
</script>
`;

function at(source: string, needle: string, extra = 0): number {
  const i = source.indexOf(needle);
  if (i < 0) throw new Error(`missing ${needle}`);
  return i + extra;
}

describe("tee virtual document", () => {
  it("keeps script offsets and treats interpolations / t-* values as expressions", () => {
    const blocks = parseSFCBlocks(setupSfc);
    const template = blocks.find((b) => b.tag === "template");
    const script = blocks.find((b) => b.tag === "script");
    expect(template && script).toBeTruthy();
    const exprs = findTemplateExprs(setupSfc, template!.contentStart, template!.contentEnd);
    expect(exprs.map((e) => e.text.trim())).toEqual([
      "count === 0",
      'guest || "访客"',
      "bump",
      "count",
    ]);
    expect(exprs[0]?.directive).toBe("t-if");
    expect(exprs[2]?.directive).toBe("t-on:click");

    const virt = virtualizeTee(setupSfc);
    expect(virt.text).toContain('from "tee-framework"');
    expect(virt.text).toContain("count === 0");
    expect(virt.text).not.toMatch(/<p /);

    const importOffset = at(setupSfc, "setup, computed");
    expect(locateTee(setupSfc, importOffset).kind).toBe("script");
    expect(locateTee(setupSfc, at(setupSfc, "{{ guest") + 3).kind).toBe("expr");
    expect(locateTee(setupSfc, at(setupSfc, 't-if="') + 6).kind).toBe("expr");
    expect(locateTee(setupSfc, at(setupSfc, "<p ") + 3).kind).toBe("tag");
  });

  it("does not hang on self-closing HTML tags", () => {
    const source = `<template><input t-model.trim="guest" /></template>`;
    const template = parseSFCBlocks(source).find((block) => block.tag === "template")!;
    expect(findTemplateExprs(source, template.contentStart, template.contentEnd)).toEqual([
      expect.objectContaining({ text: "guest", directive: "t-model.trim" }),
    ]);
  });

  it("pulls self fields, options data, computed, and methods", () => {
    const setupNames = collectComponentBindings(setupSfc).map((b) => b.name);
    expect(setupNames).toEqual(expect.arrayContaining(["guest", "count", "bump", "label", "$refs", "$emit"]));
    const guest = collectComponentBindings(setupSfc).find((b) => b.name === "guest");
    expect(guest?.type).toBe("string");
    const count = collectComponentBindings(setupSfc).find((b) => b.name === "count");
    expect(count?.type).toBe("number");

    const script = parseSFCBlocks(optionsSfc).find((b) => b.tag === "script")!;
    const optionNames = extractBindings(optionsSfc.slice(script.contentStart, script.contentEnd)).map((b) => b.name);
    expect(optionNames).toEqual(expect.arrayContaining(["title", "count", "doubled", "bump"]));
  });
});

describe("tee language service", () => {
  it("completes tee-framework exports, self fields, template names, and t-* directives", () => {
    const project = createTeeLanguageProject(process.cwd());
    const file = `${process.cwd()}/tests/fixtures/hint-sample.tee`;
    const typingImport = setupSfc.replace(
      "import { setup, computed, watch, onMounted }",
      "import {  }",
    );
    project.upsert(file, typingImport);

    const imported = project.completions(file, at(typingImport, "import { ") + "import { ".length);
    const importedNames = imported.map((c) => c.name);
    expect(importedNames).toEqual(expect.arrayContaining(["setup", "computed", "watch", "onMounted"]));

    project.upsert(file, setupSfc);
    const selfDot = project.completions(file, at(setupSfc, "self.guest") + "self.".length);
    expect(selfDot.map((c) => c.name)).toEqual(expect.arrayContaining(["$refs", "$emit", "$nextTick"]));

    const interp = project.completions(file, at(setupSfc, "{{ guest") + 3);
    expect(interp.map((c) => c.name)).toEqual(expect.arrayContaining(["guest", "count", "bump", "label"]));

    const typingAttribute = setupSfc.replace('<p t-if="count === 0"', "<p ");
    project.upsert(file, typingAttribute);
    const directives = project.completions(file, at(typingAttribute, "<p ") + 3);
    expect(directives.map((c) => c.name)).toEqual(expect.arrayContaining(["t-if", "t-on:click", "t-repeat"]));

    project.upsert(file, setupSfc);
    const hover = project.hover(file, at(setupSfc, "setup, computed"));
    expect(hover?.text ?? "").toMatch(/setup/);

    project.dispose();
  });

  it("uses real HTML, TypeScript, and Less language services", () => {
    const source = `<template>
  <input 
</template>
<script lang="ts">
const value = Math.
</script>
<style lang="less">
.card {
  col
}
</style>
`;
    const project = createTeeLanguageProject(process.cwd());
    const file = `${process.cwd()}/tests/fixtures/all-languages.tee`;
    const tagSource = "<template>\n  <\n</template>";
    project.upsert(file, tagSource);
    const tags = project.completions(file, at(tagSource, "\n  <") + 4).map((item) => item.name);
    expect(tags).toEqual(expect.arrayContaining(["div", "button", "input"]));

    project.upsert(file, source);
    const attrs = project.completions(file, at(source, "<input ") + 7).map((item) => item.name);
    expect(attrs).toEqual(expect.arrayContaining(["class", "id", "placeholder"]));

    const js = project.completions(file, at(source, "Math.") + 5).map((item) => item.name);
    expect(js).toEqual(expect.arrayContaining(["max", "round", "random"]));

    const less = project.completions(file, at(source, "  col") + 5).map((item) => item.name);
    expect(less).toContain("color");

    project.dispose();
  });
});
