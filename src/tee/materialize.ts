import type { Engine } from "./engine";
import type { Site } from "./types";

/** Default buffer (px) — materialize slightly before entering the viewport. */
export const VIEWPORT_BUFFER_PX = 200;

/** Batch size when silently promoting many off-screen sites. */
const IDLE_BATCH = 48;

export interface LaunchHooks {
  afterRun?: () => void;
}

export function observationTarget(node: Node | null): Element | null {
  if (!node) return null;
  if (node.nodeType === 1) return node as Element;
  if (node.nodeType === 3 || node.nodeType === 8) return node.parentElement;
  return null;
}

export function intersectsViewport(el: Element, buffer = VIEWPORT_BUFFER_PX): boolean {
  if (!el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  const h = window.innerHeight || document.documentElement.clientHeight || 0;
  const w = window.innerWidth || document.documentElement.clientWidth || 0;
  // happy-dom and other test envs often report 0×0; treat connected zero rects as in-viewport.
  if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) return true;
  return (
    rect.bottom >= -buffer &&
    rect.top <= h + buffer &&
    rect.right >= -buffer &&
    rect.left <= w + buffer
  );
}

type Observed = { sites: Set<Site>; hooks: Map<Site, LaunchHooks | undefined> };

export class ViewportMaterializer {
  private pending = new Set<Site>();
  private hooks = new Map<Site, LaunchHooks | undefined>();
  private observed = new Map<Element, Observed>();
  private observer: IntersectionObserver | null = null;
  private sweepQueued = false;
  private idleQueue: Site[] = [];
  private idleScheduled = false;
  /** >0 while a site.run() is promoting (nested launches defer). */
  private materializing = 0;

  constructor(
    private readonly engine: Engine,
    readonly enabled: boolean,
  ) {}

  launch(site: Site, hooks?: LaunchHooks): void {
    if (site.dead || site.materialized) return;
    const target = observationTarget(site.node);
    if (!this.enabled || target == null) {
      this.materialize(site, hooks);
      return;
    }
    if (this.materializing === 0 && target.isConnected && intersectsViewport(target)) {
      this.materialize(site, hooks);
      return;
    }
    this.pending.add(site);
    if (hooks) this.hooks.set(site, hooks);
    this.scheduleSweep();
  }

  materialize(site: Site, hooks?: LaunchHooks): void {
    if (site.dead || site.materialized) return;
    const hook = hooks ?? this.hooks.get(site);
    this.pending.delete(site);
    this.hooks.delete(site);
    this.unobserveSite(site);
    site.materialized = true;
    this.materializing += 1;
    try {
      site.run();
      hook?.afterRun?.();
    } finally {
      this.materializing -= 1;
      if (this.materializing === 0 && this.pending.size) this.drainPendingSync();
    }
    if (site.pendingMark) {
      site.pendingMark = false;
      this.engine.mark(site);
    }
  }

  /** Promote nested pending sites created during site.run(). */
  private drainPendingSync(): void {
    for (let pass = 0; pass < 64 && this.pending.size; pass++) {
      const before = this.pending.size;
      this.sweep();
      if (this.pending.size === before) break;
    }
  }

  scheduleSweep(): void {
    if (this.sweepQueued) return;
    this.sweepQueued = true;
    queueMicrotask(() => {
      this.sweepQueued = false;
      this.sweep();
    });
  }

  /** Run pending viewport checks synchronously until stable (initial mount / flush). */
  flushSync(): void {
    this.sweepQueued = false;
    for (let pass = 0; pass < 64; pass++) {
      const pendingBefore = this.pending.size;
      this.sweep();
      while (this.idleQueue.length) this.flushIdleBatch();
      if (this.pending.size === 0) return;
      if (pass > 0 && this.pending.size === pendingBefore) return;
    }
  }

  private sweep(): void {
    if (!this.enabled) return;
    for (const site of [...this.pending]) {
      const target = observationTarget(site.node);
      if (!target) {
        this.materialize(site);
        continue;
      }
      if (!target.isConnected) continue;
      if (intersectsViewport(target)) {
        this.materialize(site);
      } else {
        this.observe(target, site);
      }
    }
  }

  private observe(el: Element, site: Site): void {
    let bucket = this.observed.get(el);
    if (!bucket) {
      bucket = { sites: new Set(), hooks: new Map() };
      this.observed.set(el, bucket);
      this.ensureObserver().observe(el);
    }
    bucket.sites.add(site);
    const hook = this.hooks.get(site);
    if (hook) bucket.hooks.set(site, hook);
  }

  private unobserveSite(site: Site): void {
    const target = observationTarget(site.node);
    if (!target) return;
    const bucket = this.observed.get(target);
    if (!bucket) return;
    bucket.sites.delete(site);
    bucket.hooks.delete(site);
    if (bucket.sites.size === 0) {
      this.observed.delete(target);
      this.observer?.unobserve(target);
    }
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const bucket = this.observed.get(entry.target as Element);
      if (!bucket) continue;
      for (const site of bucket.sites) {
        if (!site.materialized && !site.dead) this.idleQueue.push(site);
      }
      this.observed.delete(entry.target as Element);
      this.observer?.unobserve(entry.target as Element);
    }
    this.scheduleIdleFlush();
  }

  private scheduleIdleFlush(): void {
    if (this.idleScheduled || this.idleQueue.length === 0) return;
    this.idleScheduled = true;
    const run = () => {
      this.idleScheduled = false;
      this.flushIdleBatch();
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 120 });
    else queueMicrotask(run);
  }

  private flushIdleBatch(): void {
    const batch = this.idleQueue.splice(0, IDLE_BATCH);
    for (const site of batch) {
      this.materialize(site, this.hooks.get(site));
    }
    if (this.idleQueue.length) this.scheduleIdleFlush();
  }

  private ensureObserver(): IntersectionObserver {
    if (!this.observer) {
      const margin = `${VIEWPORT_BUFFER_PX}px`;
      this.observer = new IntersectionObserver((entries) => this.onIntersect(entries), {
        root: null,
        rootMargin: margin,
        threshold: 0,
      });
    }
    return this.observer;
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.pending.clear();
    this.hooks.clear();
    this.observed.clear();
    this.idleQueue.length = 0;
  }
}
