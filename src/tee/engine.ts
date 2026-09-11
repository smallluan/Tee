import { TwinMap } from "./maps";
import type { MapSnapshot, PropKey, Site, SiteSnapshot } from "./types";

interface TrackFrame {
  props: Set<PropKey>;
  labels: Set<string>;
}

export class Engine {
  readonly maps = new TwinMap();
  readonly dirty = new Set<Site>();
  private tracking: TrackFrame[] = [];
  private queued = false;
  private waiters: Array<() => void> = [];
  private flushHooks: Array<() => void> = [];
  private seq = 0;
  private objectSeq = 0;
  private computedSeq = 0;

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

  private flushing = false;

  notify(prop: PropKey): void {
    for (const site of this.maps.sitesFor(prop)) this.dirty.add(site);
    if (!this.flushing) this.schedule();
  }

  schedule(): void {
    if (this.queued || this.flushing) return;
    this.queued = true;
    queueMicrotask(() => this.flush());
  }

  flush(): void {
    this.queued = false;
    this.flushing = true;
    let guard = 0;
    while (this.dirty.size && guard < 100) {
      const batch = [...this.dirty];
      this.dirty.clear();
      for (const site of batch) site.run();
      guard += 1;
    }
    this.flushing = false;
    for (const hook of this.flushHooks) hook();
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }

  afterFlush(): Promise<void> {
    if (!this.queued && this.dirty.size === 0) return Promise.resolve();
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
    for (const [site, props] of this.maps.reverse) {
      reverse.push(describeSite(site, [...props], [...(this.maps.debug.get(site) ?? props)]));
    }
    reverse.sort((a, b) => a.id - b.id);

    const forward: MapSnapshot["forward"] = [];
    for (const [prop, sites] of this.maps.forward) {
      const first = reverse.find((s) => this.maps.forward.get(prop)?.has(findSite(this, s.id)!));
      const label = first?.debugProps.find((d) => d.endsWith(prop.split(".").slice(-1)[0] ?? "")) ?? prop;
      forward.push({
        prop,
        label,
        sites: [...sites]
          .map((site) =>
            describeSite(site, [...this.maps.propsFor(site)], [...(this.maps.debug.get(site) ?? [])]),
          )
          .sort((a, b) => a.id - b.id),
      });
    }
    forward.sort((a, b) => a.prop.localeCompare(b.prop));
    return { forward, reverse };
  }

  destroy(): void {
    this.maps.clear();
    this.dirty.clear();
    this.tracking = [];
    this.flushHooks = [];
    this.waiters = [];
  }
}

function findSite(engine: Engine, id: number): Site | undefined {
  for (const site of engine.maps.reverse.keys()) if (site.id === id) return site;
  return undefined;
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
  if (node.nodeType === 3) return `#text ${JSON.stringify((node.textContent ?? "").slice(0, 40))}`;
  if (node.nodeType === 1) {
    const el = node as Element;
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className ? `.${String(el.className).trim().split(/\s+/).join(".")}` : "";
    return `<${el.tagName.toLowerCase()}${id}${cls}>`;
  }
  return node.nodeName;
}
