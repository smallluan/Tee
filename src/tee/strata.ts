/**
 * Tee Strata — ranked update lattice sitting on the bidirectional maps.
 *
 * Compile layers (template → kernel):
 *   C0 Parse     recursive descent to IR (no `with` on the hot path)
 *   C1 Classify  stable leaf vs dynamic expr vs structure
 *   C2 Codegen   IR → Function; interpret only as fallback
 *   C3 Cache     intern plans per source string
 *
 * Runtime ranks (write → patch, still no virtual tree):
 *   S0 Derived    computed cells; Object.is equal ⇒ no downstream mark
 *   S1 Leaf       stable ident/path; freeze reverse map; pull via clocks
 *   S2 Expr       dynamic expr; relink only when the dep set actually changes
 *   S3 Watch      observers, after data cells settle
 *   S4 Structure  t-show / t-repeat last, so they see committed values
 *
 * A write bumps an interned property clock, then only sites in
 * forward[prop] enter their rank bucket. Computed is pull+push: S0
 * recomputes once, later ranks read the cache if clocks match.
 */

export const Rank = {
  Derived: 0,
  Leaf: 1,
  Expr: 2,
  Watch: 3,
  Structure: 4,
} as const;

export type Rank = (typeof Rank)[keyof typeof Rank];

export const RANK_COUNT = 5;

export const STRATA = [
  { rank: Rank.Derived, id: "S0", name: "Derived", hint: "computed，值未变则切断下游" },
  { rank: Rank.Leaf, id: "S1", name: "Leaf", hint: "稳定路径，冻结反向表" },
  { rank: Rank.Expr, id: "S2", name: "Expr", hint: "动态表达式，按需重连" },
  { rank: Rank.Watch, id: "S3", name: "Watch", hint: "观察者，数据格落定后跑" },
  { rank: Rank.Structure, id: "S4", name: "Structure", hint: "t-show / t-repeat 最后提交 DOM" },
] as const;

export function rankOf(kind: string, stable: boolean): Rank {
  if (kind === "computed") return Rank.Derived;
  if (kind === "watch") return Rank.Watch;
  if (kind === "show" || kind === "repeat") return Rank.Structure;
  return stable ? Rank.Leaf : Rank.Expr;
}

export interface FlushStats {
  notify: number;
  mark: number;
  run: number;
  skipClock: number;
  skipEqual: number;
  relink: number;
  patch: number;
}

export function emptyStats(): FlushStats {
  return {
    notify: 0,
    mark: 0,
    run: 0,
    skipClock: 0,
    skipEqual: 0,
    relink: 0,
    patch: 0,
  };
}

export class Lattice {
  readonly names: string[] = [""];
  private readonly ids = new Map<string, number>();
  clocks = new Uint32Array(64);

  intern(key: string): number {
    const hit = this.ids.get(key);
    if (hit) return hit;
    const id = this.names.length;
    this.ids.set(key, id);
    this.names.push(key);
    if (id >= this.clocks.length) {
      const next = new Uint32Array(this.clocks.length * 2);
      next.set(this.clocks);
      this.clocks = next;
    }
    return id;
  }

  bump(key: string): number {
    const id = this.intern(key);
    this.clocks[id] = (this.clocks[id] + 1) | 0;
    return id;
  }
}
