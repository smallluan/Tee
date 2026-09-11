import type { PropKey, Site } from "./types";

const EMPTY_SITES: ReadonlySet<Site> = new Set();
const EMPTY_PROPS: ReadonlySet<PropKey> = new Set();

/**
 * TwinMap is Tee's only update index.
 * 正向 forward: property → the real DOM sites that must be patched
 * 反向 reverse: site → the properties that site needs in order to patch
 *
 * A write looks up forward, then patches those nodes. There is no virtual tree.
 */
export class TwinMap {
  readonly forward = new Map<PropKey, Set<Site>>();
  readonly reverse = new Map<Site, Set<PropKey>>();
  readonly debug = new Map<Site, Set<string>>();

  link(site: Site, props: Iterable<PropKey>, debugProps?: Iterable<string>): void {
    this.unlink(site);
    const set = new Set(props);
    this.reverse.set(site, set);
    this.debug.set(site, new Set(debugProps ?? set));
    for (const prop of set) {
      let bucket = this.forward.get(prop);
      if (!bucket) {
        bucket = new Set();
        this.forward.set(prop, bucket);
      }
      bucket.add(site);
    }
  }

  unlink(site: Site): void {
    const prev = this.reverse.get(site);
    if (!prev) return;
    for (const prop of prev) {
      const bucket = this.forward.get(prop);
      if (!bucket) continue;
      bucket.delete(site);
      if (bucket.size === 0) this.forward.delete(prop);
    }
    this.reverse.delete(site);
    this.debug.delete(site);
  }

  sitesFor(prop: PropKey): ReadonlySet<Site> {
    return this.forward.get(prop) ?? EMPTY_SITES;
  }

  propsFor(site: Site): ReadonlySet<PropKey> {
    return this.reverse.get(site) ?? EMPTY_PROPS;
  }

  clear(): void {
    this.forward.clear();
    this.reverse.clear();
    this.debug.clear();
  }
}
