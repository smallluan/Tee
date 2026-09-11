import type { PropKey, Site } from "./types";

const EMPTY_SITES: ReadonlySet<Site> = new Set();
const EMPTY_PROPS: ReadonlySet<PropKey> = new Set();
type SiteBucket = Site | Set<Site>;

/**
 * TwinMap is Tee's only update index.
 * 正向 forward: property → the real DOM sites that must be patched
 * 反向 reverse: site → the properties that site needs in order to patch
 *
 * A write looks up forward, then patches those nodes. There is no virtual tree.
 */
export class TwinMap {
  readonly forward = new Map<PropKey, SiteBucket>();
  readonly reverse = new Map<Site, Set<PropKey>>();
  readonly debug = new Map<Site, Set<string>>();

  link(site: Site, props: Iterable<PropKey>, debugProps?: Iterable<string>): void {
    this.unlink(site);
    const set = props instanceof Set ? props : new Set(props);
    this.reverse.set(site, set);
    this.debug.set(site, debugProps instanceof Set ? debugProps : new Set(debugProps ?? set));
    for (const prop of set) {
      const bucket = this.forward.get(prop);
      if (!bucket) {
        this.forward.set(prop, site);
      } else if (bucket instanceof Set) {
        bucket.add(site);
      } else if (bucket !== site) {
        this.forward.set(prop, new Set([bucket, site]));
      }
    }
  }

  /** Relink only when the reverse dep set actually changed. */
  linkIfChanged(site: Site, props: Iterable<PropKey>, debugProps?: Iterable<string>): boolean {
    const prev = this.reverse.get(site);
    if (prev && sameSet(prev, props)) {
      if (debugProps) this.debug.set(site, new Set(debugProps));
      return false;
    }
    this.link(site, props, debugProps);
    return true;
  }

  unlink(site: Site): void {
    const prev = this.reverse.get(site);
    if (!prev) return;
    for (const prop of prev) {
      const bucket = this.forward.get(prop);
      if (!bucket) continue;
      if (bucket instanceof Set) {
        bucket.delete(site);
        if (bucket.size === 0) this.forward.delete(prop);
        else if (bucket.size === 1) this.forward.set(prop, bucket.values().next().value as Site);
      } else if (bucket === site) {
        this.forward.delete(prop);
      }
    }
    this.reverse.delete(site);
    this.debug.delete(site);
  }

  sitesFor(prop: PropKey): ReadonlySet<Site> {
    const bucket = this.forward.get(prop);
    if (!bucket) return EMPTY_SITES;
    return bucket instanceof Set ? bucket : new Set([bucket]);
  }

  forEachSite(prop: PropKey, visit: (site: Site) => void): void {
    const bucket = this.forward.get(prop);
    if (!bucket) return;
    if (bucket instanceof Set) {
      for (const site of bucket) visit(site);
    } else {
      visit(bucket);
    }
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

function sameSet(prev: ReadonlySet<PropKey>, next: Iterable<PropKey>): boolean {
  let n = 0;
  for (const prop of next) {
    if (!prev.has(prop)) return false;
    n += 1;
  }
  return n === prev.size;
}
