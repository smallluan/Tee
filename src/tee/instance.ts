import type { Engine } from "./engine";
import type { Site } from "./types";
import type { Scope } from "./scope";

export class Instance {
  readonly sites: Site[] = [];
  readonly children: Instance[] = [];
  readonly listeners: Record<string, (payload: unknown) => void> = {};
  provides: Record<string, unknown> = {};
  parent: Instance | null = null;
  scope: Scope | null = null;
  detached = false;
  extras: Record<string, unknown> = {};
  hooks: { mounted?: () => void; updated?: () => void; unmounted?: () => void } = {};

  constructor(
    readonly engine: Engine,
    readonly root: Node | null = null,
  ) {}

  child(): Instance {
    const inst = new Instance(this.engine);
    inst.parent = this;
    this.children.push(inst);
    return inst;
  }

  lookupProvide(key: string): unknown {
    if (Object.prototype.hasOwnProperty.call(this.provides, key)) return this.provides[key];
    return this.parent?.lookupProvide(key);
  }

  destroy(): void {
    this.detached = true;
    this.hooks.unmounted?.();
    for (const child of this.children) child.destroy();
    this.children.length = 0;
    for (const site of this.sites) {
      site.dead = true;
      this.engine.maps.unlink(site);
    }
    this.sites.length = 0;
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
  }
}
