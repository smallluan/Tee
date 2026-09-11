import { describe, expect, it } from "vitest";
import { TwinMap } from "tee";
import type { Site } from "../src/tee/types";

function site(id: number): Site {
  return { id, kind: "text", node: null, label: `#${id}`, run: () => undefined };
}

describe("TwinMap", () => {
  it("links forward property buckets to reverse site props", () => {
    const maps = new TwinMap();
    const a = site(1);
    const b = site(2);
    maps.link(a, ["user.name", "title"], ["name", "title"]);
    maps.link(b, ["title"]);

    expect([...maps.sitesFor("title")].map((s) => s.id).sort()).toEqual([1, 2]);
    expect([...maps.sitesFor("user.name")].map((s) => s.id)).toEqual([1]);
    expect([...maps.propsFor(a)]).toEqual(["user.name", "title"]);
  });

  it("relinks a site without leaving stale forward entries", () => {
    const maps = new TwinMap();
    const a = site(1);
    maps.link(a, ["left"]);
    maps.link(a, ["right"]);
    expect(maps.sitesFor("left").size).toBe(0);
    expect([...maps.sitesFor("right")][0]).toBe(a);
    maps.unlink(a);
    expect(maps.forward.size).toBe(0);
    expect(maps.reverse.size).toBe(0);
  });

  it("skips relink when the reverse set is unchanged", () => {
    const maps = new TwinMap();
    const a = site(1);
    expect(maps.linkIfChanged(a, ["title"])).toBe(true);
    expect(maps.linkIfChanged(a, ["title"])).toBe(false);
    expect(maps.linkIfChanged(a, ["title", "name"])).toBe(true);
    expect([...maps.propsFor(a)].sort()).toEqual(["name", "title"]);
  });
});
