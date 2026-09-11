/**
 * Tee IR — compile templates once, then run generated functions.
 * Recursive-descent parse → classify → codegen. `with(proxy)` is fallback only.
 */

export type Get = (name: string) => unknown;

export type IR =
  | { t: "lit"; v: unknown }
  | { t: "id"; n: string }
  | { t: "mem"; o: IR; k: string }
  | { t: "idx"; o: IR; k: IR }
  | { t: "un"; op: "!" | "-" | "+"; a: IR }
  | { t: "bin"; op: string; l: IR; r: IR }
  | { t: "cond"; c: IR; a: IR; b: IR }
  | { t: "call"; f: IR; a: IR[] }
  | { t: "arr"; xs: IR[] }
  | { t: "obj"; xs: Array<{ k: string; v: IR }> }
  | { t: "fn"; p: string[]; b: IR };

export interface ExprPlan {
  src: string;
  ir: IR | null;
  stable: boolean;
  run: ((get: Get) => unknown) | null;
}

export type StmtPlan =
  | { t: "assign"; path: string[]; expr: IR; run: (get: Get) => unknown }
  | { t: "call"; expr: IR; run: (get: Get) => unknown }
  | { t: "raw"; src: string };

const GLOBALS: Record<string, unknown> = {
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Date,
  JSON,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  undefined,
  NaN,
  Infinity,
  true: true,
  false: false,
  null: null,
};

const planCache = new Map<string, ExprPlan>();
const stmtCache = new Map<string, StmtPlan>();

export function compileExpr(src: string): ExprPlan {
  const key = src.trim();
  const hit = planCache.get(key);
  if (hit) return hit;
  try {
    const parser = new Parser(key);
    const ir = parser.parseExpr();
    parser.expectEnd();
    const plan: ExprPlan = { src: key, ir, stable: isStable(ir), run: compileRunner(ir) };
    planCache.set(key, plan);
    return plan;
  } catch {
    const plan: ExprPlan = { src: key, ir: null, stable: false, run: null };
    planCache.set(key, plan);
    return plan;
  }
}

export function compileStmt(src: string): StmtPlan {
  const key = src.trim();
  const hit = stmtCache.get(key);
  if (hit) return hit;
  try {
    const parser = new Parser(key);
    const start = parser.index;
    const left = parser.parseExpr();
    if (parser.eatAssign() && leftIsPath(left)) {
      const expr = parser.parseExpr();
      parser.expectEnd();
      const plan: StmtPlan = { t: "assign", path: flattenPath(left), expr, run: compileRunner(expr) };
      stmtCache.set(key, plan);
      return plan;
    }
    parser.index = start;
    const expr = parser.parseExpr();
    parser.expectEnd();
    const plan: StmtPlan = { t: "call", expr, run: compileRunner(expr) };
    stmtCache.set(key, plan);
    return plan;
  } catch {
    const plan: StmtPlan = { t: "raw", src: key };
    stmtCache.set(key, plan);
    return plan;
  }
}

export function evalIR(ir: IR, get: Get): unknown {
  switch (ir.t) {
    case "lit":
      return ir.v;
    case "id": {
      const value = get(ir.n);
      return value === undefined && Object.prototype.hasOwnProperty.call(GLOBALS, ir.n)
        ? GLOBALS[ir.n]
        : value;
    }
    case "mem": {
      const obj = evalIR(ir.o, get);
      if (obj == null) return undefined;
      return (obj as Record<string, unknown>)[ir.k];
    }
    case "idx": {
      const obj = evalIR(ir.o, get);
      if (obj == null) return undefined;
      return (obj as Record<string, unknown>)[evalIR(ir.k, get) as string];
    }
    case "un": {
      const a = evalIR(ir.a, get);
      if (ir.op === "!") return !a;
      if (ir.op === "-") return -(a as number);
      return +(a as number);
    }
    case "bin": {
      if (ir.op === "&&") return evalIR(ir.l, get) && evalIR(ir.r, get);
      if (ir.op === "||") return evalIR(ir.l, get) || evalIR(ir.r, get);
      return evalBin(ir.op, evalIR(ir.l, get), evalIR(ir.r, get));
    }
    case "cond":
      return evalIR(ir.c, get) ? evalIR(ir.a, get) : evalIR(ir.b, get);
    case "call": {
      const args = ir.a.map((arg) => evalIR(arg, get));
      if (ir.f.t === "mem") {
        const recv = evalIR(ir.f.o, get);
        const fn = recv == null ? undefined : (recv as Record<string, unknown>)[ir.f.k];
        return typeof fn === "function" ? fn.apply(recv, args) : undefined;
      }
      const fn = evalIR(ir.f, get);
      return typeof fn === "function" ? fn.apply(undefined, args) : undefined;
    }
    case "arr":
      return ir.xs.map((x) => evalIR(x, get));
    case "obj": {
      const out: Record<string, unknown> = {};
      for (const { k, v } of ir.xs) out[k] = evalIR(v, get);
      return out;
    }
    case "fn":
      return (...args: unknown[]) => {
        const inner: Get = (name) => {
          const i = ir.p.indexOf(name);
          return i >= 0 ? args[i] : get(name);
        };
        return evalIR(ir.b, inner);
      };
  }
}

function compileRunner(ir: IR): (get: Get) => unknown {
  try {
    const body = emit(ir, new Set());
    const factory = new Function(
      "G",
      `"use strict";
return function(get){
  function id(n){var v=get(n);return (v===void 0 && n in G)?G[n]:v}
  return (${body});
};`,
    ) as (g: typeof GLOBALS) => (get: Get) => unknown;
    return factory(GLOBALS);
  } catch {
    return (get) => evalIR(ir, get);
  }
}

function emit(ir: IR, locals: Set<string>): string {
  switch (ir.t) {
    case "lit":
      if (ir.v === undefined) return "void 0";
      if (typeof ir.v === "number" && Number.isNaN(ir.v)) return "NaN";
      if (ir.v === Infinity) return "Infinity";
      if (ir.v === -Infinity) return "-Infinity";
      return JSON.stringify(ir.v);
    case "id":
      return locals.has(ir.n) ? ir.n : `id(${JSON.stringify(ir.n)})`;
    case "mem":
      return `((o)=>o==null?void 0:o[${JSON.stringify(ir.k)}])(${emit(ir.o, locals)})`;
    case "idx":
      return `((o,k)=>o==null?void 0:o[k])(${emit(ir.o, locals)},${emit(ir.k, locals)})`;
    case "un":
      return `(${ir.op}${emit(ir.a, locals)})`;
    case "bin":
      return `(${emit(ir.l, locals)}${ir.op}${emit(ir.r, locals)})`;
    case "cond":
      return `(${emit(ir.c, locals)}?${emit(ir.a, locals)}:${emit(ir.b, locals)})`;
    case "call":
      if (ir.f.t === "mem") {
        return `((o,k,a)=>{var f=o==null?void 0:o[k];return typeof f==="function"?f.apply(o,a):void 0})(${emit(ir.f.o, locals)},${JSON.stringify(ir.f.k)},[${ir.a.map((a) => emit(a, locals)).join(",")}])`;
      }
      return `((f,a)=>typeof f==="function"?f.apply(void 0,a):void 0)(${emit(ir.f, locals)},[${ir.a.map((a) => emit(a, locals)).join(",")}])`;
    case "arr":
      return `[${ir.xs.map((x) => emit(x, locals)).join(",")}]`;
    case "obj":
      return `({${ir.xs.map(({ k, v }) => `${JSON.stringify(k)}:${emit(v, locals)}`).join(",")}})`;
    case "fn": {
      const next = new Set(locals);
      for (const p of ir.p) next.add(p);
      return `((${ir.p.join(",")})=>(${emit(ir.b, next)}))`;
    }
  }
}

function isStable(ir: IR): boolean {
  switch (ir.t) {
    case "lit":
    case "id":
      return true;
    case "mem":
      return isStable(ir.o);
    case "idx":
      return isStable(ir.o) && isStable(ir.k);
    case "un":
      return isStable(ir.a);
    case "bin":
      return ir.op !== "&&" && ir.op !== "||" && isStable(ir.l) && isStable(ir.r);
    case "arr":
      return ir.xs.every(isStable);
    case "obj":
      return ir.xs.every((x) => isStable(x.v));
    case "fn":
      return true;
    case "cond":
    case "call":
      return false;
  }
}

function evalBin(op: string, l: unknown, r: unknown): unknown {
  switch (op) {
    case "+":
      return (l as number) + (r as number);
    case "-":
      return (l as number) - (r as number);
    case "*":
      return (l as number) * (r as number);
    case "/":
      return (l as number) / (r as number);
    case "%":
      return (l as number) % (r as number);
    case ">":
      return (l as number) > (r as number);
    case "<":
      return (l as number) < (r as number);
    case ">=":
      return (l as number) >= (r as number);
    case "<=":
      return (l as number) <= (r as number);
    case "===":
      return l === r;
    case "!==":
      return l !== r;
    case "==":
      return l == r;
    case "!=":
      return l != r;
    default:
      return undefined;
  }
}

function leftIsPath(ir: IR): boolean {
  return ir.t === "id" || (ir.t === "mem" && leftIsPath(ir.o));
}

function flattenPath(ir: IR): string[] {
  if (ir.t === "id") return [ir.n];
  if (ir.t === "mem") return [...flattenPath(ir.o), ir.k];
  return [];
}

class Parser {
  index = 0;
  constructor(private readonly s: string) {}

  parseExpr(): IR {
    return this.parseCond();
  }

  expectEnd(): void {
    this.ws();
    if (this.index < this.s.length) throw new Error("trailing");
  }

  eat(op: string): boolean {
    this.ws();
    if (this.s.startsWith(op, this.index)) {
      this.index += op.length;
      return true;
    }
    return false;
  }

  eatAssign(): boolean {
    this.ws();
    if (this.s[this.index] !== "=") return false;
    const next = this.s[this.index + 1];
    if (next === "=" || next === ">") return false;
    this.index += 1;
    return true;
  }

  private parseCond(): IR {
    const c = this.parseOr();
    this.ws();
    if (!this.eat("?")) return c;
    const a = this.parseExpr();
    this.ws();
    if (!this.eat(":")) throw new Error(":");
    return { t: "cond", c, a, b: this.parseCond() };
  }

  private parseOr(): IR {
    let left = this.parseAnd();
    while (this.eat("||")) left = { t: "bin", op: "||", l: left, r: this.parseAnd() };
    return left;
  }

  private parseAnd(): IR {
    let left = this.parseEq();
    while (this.eat("&&")) left = { t: "bin", op: "&&", l: left, r: this.parseEq() };
    return left;
  }

  private parseEq(): IR {
    let left = this.parseCmp();
    for (;;) {
      const op = this.eat("===") ? "===" : this.eat("!==") ? "!==" : this.eat("==") ? "==" : this.eat("!=") ? "!=" : "";
      if (!op) return left;
      left = { t: "bin", op, l: left, r: this.parseCmp() };
    }
  }

  private parseCmp(): IR {
    let left = this.parseAdd();
    for (;;) {
      const op = this.eat(">=") ? ">=" : this.eat("<=") ? "<=" : this.eat(">") ? ">" : this.eat("<") ? "<" : "";
      if (!op) return left;
      left = { t: "bin", op, l: left, r: this.parseAdd() };
    }
  }

  private parseAdd(): IR {
    let left = this.parseMul();
    for (;;) {
      if (this.eat("+")) left = { t: "bin", op: "+", l: left, r: this.parseMul() };
      else if (this.eat("-")) left = { t: "bin", op: "-", l: left, r: this.parseMul() };
      else return left;
    }
  }

  private parseMul(): IR {
    let left = this.parseUnary();
    for (;;) {
      if (this.eat("*")) left = { t: "bin", op: "*", l: left, r: this.parseUnary() };
      else if (this.eat("/")) left = { t: "bin", op: "/", l: left, r: this.parseUnary() };
      else if (this.eat("%")) left = { t: "bin", op: "%", l: left, r: this.parseUnary() };
      else return left;
    }
  }

  private parseUnary(): IR {
    if (this.eat("!")) return { t: "un", op: "!", a: this.parseUnary() };
    if (this.eat("-")) return { t: "un", op: "-", a: this.parseUnary() };
    if (this.eat("+")) return { t: "un", op: "+", a: this.parseUnary() };
    return this.parsePostfix();
  }

  private parsePostfix(): IR {
    let node = this.parsePrimary();
    for (;;) {
      if (this.eat(".")) {
        node = { t: "mem", o: node, k: this.ident() };
        continue;
      }
      if (this.eat("[")) {
        const k = this.parseExpr();
        if (!this.eat("]")) throw new Error("]");
        node = { t: "idx", o: node, k };
        continue;
      }
      if (this.eat("(")) {
        const a: IR[] = [];
        this.ws();
        if (!this.eat(")")) {
          a.push(this.parseExpr());
          while (this.eat(",")) a.push(this.parseExpr());
          this.ws();
          if (!this.eat(")")) throw new Error(")");
        }
        node = { t: "call", f: node, a };
        continue;
      }
      return node;
    }
  }

  private parsePrimary(): IR {
    this.ws();
    const ch = this.s[this.index];
    if (ch === "'" || ch === '"') return { t: "lit", v: this.string() };
    if (ch === "[") return this.parseArray();
    if (ch === "{") return this.parseObject();
    if (ch === "(") return this.parseParenOrArrow();
    if (ch >= "0" && ch <= "9") return { t: "lit", v: this.number() };
    const id = this.ident();
    if (this.eat("=>")) return { t: "fn", p: [id], b: this.parseExpr() };
    if (id === "true") return { t: "lit", v: true };
    if (id === "false") return { t: "lit", v: false };
    if (id === "null") return { t: "lit", v: null };
    if (id === "undefined") return { t: "lit", v: undefined };
    return { t: "id", n: id };
  }

  private parseParenOrArrow(): IR {
    this.index += 1;
    this.ws();
    if (this.eat(")")) {
      if (!this.eat("=>")) throw new Error("empty");
      return { t: "fn", p: [], b: this.parseExpr() };
    }
    const afterOpen = this.index;
    const params: string[] = [];
    try {
      params.push(this.ident());
      while (this.eat(",")) params.push(this.ident());
      this.ws();
      if (this.eat(")") && this.eat("=>")) return { t: "fn", p: params, b: this.parseExpr() };
    } catch {
      /* grouped expression */
    }
    this.index = afterOpen;
    const inner = this.parseExpr();
    this.ws();
    if (!this.eat(")")) throw new Error(")");
    return inner;
  }

  private parseArray(): IR {
    this.index += 1;
    const xs: IR[] = [];
    this.ws();
    if (this.eat("]")) return { t: "arr", xs };
    for (;;) {
      xs.push(this.parseExpr());
      if (this.eat("]")) return { t: "arr", xs };
      if (!this.eat(",")) throw new Error("arr");
      this.ws();
      if (this.eat("]")) return { t: "arr", xs };
    }
  }

  private parseObject(): IR {
    this.index += 1;
    const xs: Array<{ k: string; v: IR }> = [];
    this.ws();
    if (this.eat("}")) return { t: "obj", xs };
    for (;;) {
      this.ws();
      const ch = this.s[this.index];
      let k: string;
      if (ch === "'" || ch === '"') k = this.string();
      else if (ch >= "0" && ch <= "9") k = String(this.number());
      else k = this.ident();
      this.ws();
      const v = this.eat(":") ? this.parseExpr() : { t: "id" as const, n: k };
      xs.push({ k, v });
      if (this.eat("}")) return { t: "obj", xs };
      if (!this.eat(",")) throw new Error("obj");
      this.ws();
      if (this.eat("}")) return { t: "obj", xs };
    }
  }

  private ident(): string {
    this.ws();
    const start = this.index;
    const ch = this.s[this.index];
    if (!ch || !/[A-Za-z_$]/.test(ch)) throw new Error("ident");
    this.index += 1;
    while (this.index < this.s.length && /[\w$]/.test(this.s[this.index])) this.index += 1;
    return this.s.slice(start, this.index);
  }

  private number(): number {
    const start = this.index;
    while (this.index < this.s.length && /[0-9.]/.test(this.s[this.index])) this.index += 1;
    return Number(this.s.slice(start, this.index));
  }

  private string(): string {
    const q = this.s[this.index];
    this.index += 1;
    let out = "";
    while (this.index < this.s.length) {
      const ch = this.s[this.index];
      if (ch === q) {
        this.index += 1;
        return out;
      }
      if (ch === "\\") {
        this.index += 1;
        out += this.s[this.index] ?? "";
        this.index += 1;
        continue;
      }
      out += ch;
      this.index += 1;
    }
    throw new Error("string");
  }

  private ws(): void {
    while (this.index < this.s.length && this.s[this.index] <= " ") this.index += 1;
  }
}
