import type { Engine } from "./engine";
import type { Site } from "./types";
import type { Scope } from "./scope";

const EMPTY_RECORD = Object.freeze({}) as Record<string, unknown>;
const EMPTY_LISTENERS = Object.freeze({}) as Record<string, (payload: unknown) => void>;
const EMPTY_HOOKS = Object.freeze({}) as Instance["hooks"];
const EMPTY_CHILDREN: ReadonlySet<Instance> = new Set();

export class Instance {
  readonly sites: Site[] = [];
  readonly listeners: Record<string, (payload: unknown) => void>;
  provides: Record<string, unknown>;
  parent: Instance | null = null;
  scope: Scope | null = null;
  detached = false;
  extras: Record<string, unknown>;
  hooks: { mounted?: () => void; updated?: () => void; unmounted?: () => void };
  private childSet: Set<Instance> | null = null;

  constructor(
    readonly engine: Engine,
    readonly root: Node | null = null,
    lean = false,
  ) {
    this.listeners = lean ? EMPTY_LISTENERS : {};
    this.provides = lean ? EMPTY_RECORD : {};
    this.extras = lean ? EMPTY_RECORD : {};
    this.hooks = lean ? EMPTY_HOOKS : {};
  }

  get children(): ReadonlySet<Instance> {
    return this.childSet ?? EMPTY_CHILDREN;
  }

  child(lean = false): Instance {
    const inst = new Instance(this.engine, null, lean);
    inst.parent = this;
    if (!this.childSet) this.childSet = new Set();
    this.childSet.add(inst);
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
    this.childSet?.clear();
    this.childSet = null;
    for (const site of this.sites) {
      site.dead = true;
      site.dispose?.();
      this.engine.maps.unlink(site);
    }
    this.sites.length = 0;
    this.parent?.childSet?.delete(this);
    this.parent = null;
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
  }
}
