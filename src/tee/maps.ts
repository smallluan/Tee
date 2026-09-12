import type { PropKey, Site } from "./types";

const EMPTY_SITES: ReadonlySet<Site> = new Set();
const EMPTY_PROPS: ReadonlySet<PropKey> = new Set();
type SiteBucket = Site | Set<Site>;
type PropBucket = PropKey | Set<PropKey>;
type DebugBucket = string | Set<string>;

/**
 * TwinMap is Tee's only update index.
 * 正向 forward: property → the real DOM sites that must be patched
 * 反向 reverse: site → the properties that site needs in order to patch
 *
 * A write looks up forward, then patches those nodes. There is no virtual tree.
 */
export class TwinMap {
  readonly forward = new Map<PropKey, SiteBucket>();
  readonly reverse = new Map<Site, PropBucket>();
  readonly debug = new Map<Site, DebugBucket>();

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

  linkOne(site: Site, prop: PropKey, debugProp = prop): void {
    this.unlink(site);
    this.reverse.set(site, prop);
    site.debugLabel = debugProp;
    const bucket = this.forward.get(prop);
    if (!bucket) {
      this.forward.set(prop, site);
    } else if (bucket instanceof Set) {
      bucket.add(site);
    } else if (bucket !== site) {
      this.forward.set(prop, new Set([bucket, site]));
    }
  }

  /** Relink only when the reverse dep set actually changed. */
  linkIfChanged(site: Site, props: Iterable<PropKey>, debugProps?: Iterable<string>): boolean {
    const prev = this.reverse.get(site);
    if (prev instanceof Set && sameSet(prev, props)) {
      if (debugProps) this.debug.set(site, new Set(debugProps));
      return false;
    }
    this.link(site, props, debugProps);
    return true;
  }

  unlink(site: Site): void {
    const prev = this.reverse.get(site);
    if (!prev) return;
    if (typeof prev === "string") {
      this.unlinkForward(prev, site);
      this.reverse.delete(site);
      this.debug.delete(site);
      site.debugLabel = undefined;
      return;
    }
    for (const prop of prev) {
      this.unlinkForward(prop, site);
    }
    this.reverse.delete(site);
    this.debug.delete(site);
    site.debugLabel = undefined;
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
    const bucket = this.reverse.get(site);
    if (!bucket) return EMPTY_PROPS;
    return typeof bucket === "string" ? new Set([bucket]) : bucket;
  }

  debugFor(site: Site): ReadonlySet<string> {
    const bucket = this.debug.get(site);
    if (!bucket) return site.debugLabel ? new Set([site.debugLabel]) : EMPTY_PROPS;
    return typeof bucket === "string" ? new Set([bucket]) : bucket;
  }

  clear(): void {
    this.forward.clear();
    this.reverse.clear();
    this.debug.clear();
  }

  private unlinkForward(prop: PropKey, site: Site): void {
    const bucket = this.forward.get(prop);
    if (!bucket) return;
    if (bucket instanceof Set) {
      bucket.delete(site);
      if (bucket.size === 0) this.forward.delete(prop);
      else if (bucket.size === 1) this.forward.set(prop, bucket.values().next().value as Site);
    } else if (bucket === site) {
      this.forward.delete(prop);
    }
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
