import { TwinMap } from "./maps";
import { RANK_COUNT, Rank, Lattice, emptyStats, type FlushStats } from "./strata";
import type { MapSnapshot, PropKey, Site, SiteSnapshot } from "./types";

interface TrackFrame {
  props: Set<PropKey>;
  labels: Set<string>;
}

export class Engine {
  readonly maps = new TwinMap();
  readonly lattice = new Lattice();
  readonly buckets: Site[][] = Array.from({ length: RANK_COUNT }, () => []);
  private spare: Site[][] = Array.from({ length: RANK_COUNT }, () => []);
  private tracking: TrackFrame[] = [];
  private queued = false;
  private flushing = false;
  private waiters: Array<() => void> = [];
  private flushHooks: Array<() => void> = [];
  private seq = 0;
  private objectSeq = 0;
  private computedSeq = 0;
  stats: FlushStats = emptyStats();
  lastFlush: FlushStats = emptyStats();

  nextSiteId(): number {
    return ++this.seq;
  }

  nextObjectId(): string {
    return "o" + ++this.objectSeq;
  }

  nextComputedId(name: string): string {
    return "c" + ++this.computedSeq + "." + name;
  }

  startTrack(): void {
    this.tracking.push({ props: new Set(), labels: new Set() });
  }

  record(prop: PropKey, label = prop): void {
    const frame = this.tracking[this.tracking.length - 1];
    if (!frame) return;
    frame.props.add(prop);
    frame.labels.add(label);
  }

  stopTrack(): { props: Set<PropKey>; labels: Set<string> } {
    return this.tracking.pop() ?? { props: new Set(), labels: new Set() };
  }

  notify(prop: PropKey): void {
    this.stats.notify += 1;
    this.lattice.bump(prop);
    this.maps.forEachSite(prop, (site) => this.mark(site));
    if (!this.flushing) this.schedule();
  }

  mark(site: Site): void {
    if (site.dead || site.queued) return;
    site.queued = true;
    this.stats.mark += 1;
    this.buckets[site.rank ?? Rank.Expr].push(site);
  }

  stale(site: Site): boolean {
    if (site.depId) return this.lattice.clocks[site.depId] !== site.seenClock;
    const deps = site.depIds;
    const seen = site.seen;
    if (!deps || !seen || deps.length === 0) return true;
    const clocks = this.lattice.clocks;
    for (let i = 0; i < deps.length; i++) if (clocks[deps[i]] !== seen[i]) return true;
    return false;
  }

  capture(site: Site): void {
    const bucket = this.maps.propBucketFor(site);
    if (typeof bucket === "string") {
      const id = this.lattice.intern(bucket);
      site.depId = id;
      site.seenClock = this.lattice.clocks[id];
      site.depIds = undefined;
      site.seen = undefined;
      return;
    }
    site.depId = undefined;
    site.seenClock = undefined;
    const props = bucket ?? new Set<PropKey>();
    const depIds = new Array<number>(props.size);
    const seen = new Array<number>(props.size);
    let i = 0;
    for (const prop of props) {
      const id = this.lattice.intern(prop);
      depIds[i] = id;
      seen[i] = this.lattice.clocks[id];
      i += 1;
    }
    site.depIds = depIds;
    site.seen = seen;
  }

  touch(site: Site): void {
    if (site.depId) {
      site.seenClock = this.lattice.clocks[site.depId];
      return;
    }
    const deps = site.depIds;
    if (!deps) return;
    const seen = site.seen ?? new Array<number>(deps.length);
    const clocks = this.lattice.clocks;
    for (let i = 0; i < deps.length; i++) seen[i] = clocks[deps[i]];
    site.seen = seen;
  }

  commitTrack(site: Site, tracked: { props: Set<PropKey>; labels: Set<string> }): void {
    if (this.maps.linkIfChanged(site, tracked.props, tracked.labels)) this.stats.relink += 1;
    this.capture(site);
    site.linked = true;
  }

  schedule(): void {
    if (this.queued || this.flushing) return;
    this.queued = true;
    queueMicrotask(() => this.flush());
  }

  flush(): void {
    this.queued = false;
    this.flushing = true;
    this.stats.run = 0;
    this.stats.skipClock = 0;
    this.stats.skipEqual = 0;
    this.stats.relink = 0;
    this.stats.patch = 0;
    let pass = 0;
    while (pass < 8) {
      let work = false;
      for (let rank = 0; rank < RANK_COUNT; rank++) {
        const batch = this.buckets[rank];
        if (batch.length === 0) continue;
        this.buckets[rank] = this.spare[rank];
        this.spare[rank] = batch;
        work = true;
        for (let i = 0; i < batch.length; i++) {
          const site = batch[i];
          site.queued = false;
          if (!site.dead) {
            this.stats.run += 1;
            site.run();
          }
        }
        batch.length = 0;
      }
      if (!work) break;
      pass += 1;
    }
    this.flushing = false;
    this.lastFlush = this.stats;
    this.stats = emptyStats();
    for (const hook of this.flushHooks) hook();
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }

  afterFlush(): Promise<void> {
    if (!this.queued && !this.hasDirty()) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  onFlush(hook: () => void): () => void {
    this.flushHooks.push(hook);
    return () => {
      this.flushHooks = this.flushHooks.filter((h) => h !== hook);
    };
  }

  snapshot(): MapSnapshot {
    const reverse: SiteSnapshot[] = [];
    for (const site of this.maps.reverse.keys()) {
      reverse.push(describeSite(site, [...this.maps.propsFor(site)], [...this.maps.debugFor(site)]));
    }
    reverse.sort((a, b) => a.id - b.id);

    const forward: MapSnapshot["forward"] = [];
    for (const [prop, bucket] of this.maps.forward) {
      const sites = bucket instanceof Set ? [...bucket] : [bucket];
      forward.push({
        prop,
        label: prop,
        sites: sites
          .map((site) =>
            describeSite(site, [...this.maps.propsFor(site)], [...this.maps.debugFor(site)]),
          )
          .sort((a, b) => a.id - b.id),
      });
    }
    forward.sort((a, b) => a.prop.localeCompare(b.prop));
    return { forward, reverse };
  }

  destroy(): void {
    this.maps.clear();
    for (const bucket of this.buckets) bucket.length = 0;
    for (const bucket of this.spare) bucket.length = 0;
    this.tracking = [];
    this.flushHooks = [];
    this.waiters = [];
  }

  private hasDirty(): boolean {
    for (const bucket of this.buckets) if (bucket.length) return true;
    return false;
  }
}

function describeSite(site: Site, props: string[], debugProps: string[]): SiteSnapshot {
  return {
    id: site.id,
    kind: site.kind,
    label: site.label,
    node: describeNode(site.node),
    props,
    debugProps,
  };
}

function describeNode(node: Node | null): string {
  if (!node) return "(none)";
  if (node.nodeType === 8) return `#comment ${node.textContent ?? ""}`;
  if (node.nodeType === 3) return `#text ${JSON.stringify((node.data ?? "").slice(0, 40))}`;
  if (node.nodeType === 1) {
    const el = node as Element;
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className ? `.${String(el.className).trim().split(/\s+/).join(".")}` : "";
    return `<${el.tagName.toLowerCase()}${id}${cls}>`;
  }
  return node.nodeName;
}
