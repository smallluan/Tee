import type { PropKey, Site } from "./types";

const EMPTY_SITES: ReadonlySet<Site> = new Set();
const EMPTY_PROPS: ReadonlySet<PropKey> = new Set();
type SiteBucket = Site | Set<Site>;
type PropBucket = PropKey | Set<PropKey>;
type LabelBucket = string | Set<string>;

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
  readonly debug = new Map<Site, LabelBucket>();

  link(site: Site, props: Iterable<PropKey>, debugProps?: Iterable<string>): void {
    this.unlink(site);
    const set = props instanceof Set ? props : new Set(props);
    this.reverse.set(site, compact(set));
    const labels = debugProps instanceof Set ? debugProps : new Set(debugProps ?? set);
    this.debug.set(site, compact(labels));
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
    if (prev && sameBucket(prev, props)) {
      if (debugProps) {
        const labels = debugProps instanceof Set ? debugProps : new Set(debugProps);
        this.debug.set(site, compact(labels));
      }
      return false;
    }
    this.link(site, props, debugProps);
    return true;
  }

  unlink(site: Site): void {
    const prev = this.reverse.get(site);
    if (!prev) return;
    for (const prop of values(prev)) {
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
    const bucket = this.reverse.get(site);
    if (!bucket) return EMPTY_PROPS;
    return typeof bucket === "string" ? new Set([bucket]) : bucket;
  }

  propBucketFor(site: Site): PropBucket | undefined {
    return this.reverse.get(site);
  }

  debugFor(site: Site): ReadonlySet<string> {
    const bucket = this.debug.get(site);
    if (!bucket) return EMPTY_PROPS;
    return typeof bucket === "string" ? new Set([bucket]) : bucket;
  }

  clear(): void {
    this.forward.clear();
    this.reverse.clear();
    this.debug.clear();
  }
}

function compact<T>(set: Set<T>): T | Set<T> {
  return set.size === 1 ? (set.values().next().value as T) : set;
}

function values<T>(bucket: T | Set<T>): Iterable<T> {
  return bucket instanceof Set ? bucket : [bucket];
}

function sameBucket(prev: PropBucket, next: Iterable<PropKey>): boolean {
  let n = 0;
  for (const prop of next) {
    if (typeof prev === "string" ? prev !== prop : !prev.has(prop)) return false;
    n += 1;
  }
  return n === (typeof prev === "string" ? 1 : prev.size);
}
