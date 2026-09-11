import type { Engine } from "./engine";
import type { Site } from "./types";
import type { Scope } from "./scope";

export class Instance {
  readonly sites: Site[] = [];
  readonly children: Instance[] = [];
  scope: Scope | null = null;
  detached = false;

  constructor(
    readonly engine: Engine,
    readonly root: Node | null = null,
  ) {}

  child(): Instance {
    const inst = new Instance(this.engine);
    this.children.push(inst);
    return inst;
  }

  destroy(): void {
    this.detached = true;
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
