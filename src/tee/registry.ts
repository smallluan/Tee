import type { TagDef } from "./types";

const registry = new Map<string, TagDef>();

/** Register a reusable tag. Custom tag names need a hyphen (`mini-counter`). */
export function define(name: string, def: TagDef): TagDef {
  def.tag = name;
  registry.set(name.toLowerCase(), def);
  return def;
}

export function lookupTag(name: string): TagDef | undefined {
  return registry.get(name.toLowerCase());
}
