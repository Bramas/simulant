/** The surface syntax of `.sim` files, with source spans. */
import type { Span } from './lexer';

export type SType =
  | { t: 'name'; name: string; args: SType[]; span: Span }
  | { t: 'record'; fields: SFieldType[]; span: Span };

export type SFieldType = { name: string; type: SType; default?: SExpr; span: Span };

export type SArg = { name?: string; value: SExpr };

export type SPat =
  | { t: 'ctor'; name: string; span: Span }   // .cw or Move.cw
  | { t: 'wild'; span: Span }
  | { t: 'none'; span: Span }
  | { t: 'some'; name: string; span: Span }
  | { t: 'bool'; value: boolean; span: Span };

export type SRecordItem =
  | { t: 'field'; name: string; value?: SExpr; span: Span }   // `f := e`, or `f` (punning)
  | { t: 'raise'; flag: string; value: SExpr; span: Span };  // `raise dead := S`, in effects

export type SExpr = { span: Span } & (
  | { t: 'num'; value: number }
  | { t: 'str'; value: string }
  | { t: 'bool'; value: boolean }
  | { t: 'name'; name: string }                       // possibly dotted: C.world.site
  | { t: 'ctor'; name: string }                       // .cw
  | { t: 'proj'; on: SExpr; field: string }           // (e).f
  | { t: 'app'; fn: SExpr; args: SArg[] }
  | { t: 'binop'; op: string; l: SExpr; r: SExpr }
  | { t: 'unop'; op: string; e: SExpr }
  | { t: 'if'; cond: SExpr; then: SExpr; else: SExpr }
  | { t: 'let'; name: string; type?: SType; value: SExpr; body: SExpr }
  | { t: 'match'; on: SExpr; cases: { pat: SPat; body: SExpr }[] }
  | { t: 'fun'; params: { name: string; type?: SType }[]; body: SExpr }
  | { t: 'list'; items: SExpr[] }
  | { t: 'record'; base?: SExpr; items: SRecordItem[] }
  | { t: 'choose'; from: SExpr; such?: SExpr; labels?: SExpr }
  | { t: 'param'; name: string }
  | { t: 'ascribe'; e: SExpr; type: SType }
  | { t: 'nothing' }
  | { t: 'unit' }                                     // ()
  | { t: 'hole' }                                     // `·` in a section, before desugaring
  | { t: 'flag'; name: string; visibility: 'visible' | 'hidden'; acts: 'never' | 'adversary' }
  | { t: 'action'; name: string; type: SType; default: SExpr }
  | { t: 'typeValue'; type: SType }                   // a type in a `where` block: `World := { site : Node }`
);

export type SBinder = { name: string; type: SType; default?: SExpr; span: Span };

/** Statements of structured algorithms (plan 3.8). `move`, `stay` and `halt` end the activation. */
export type SStmt = { span: Span } & (
  | { s: 'move'; dir: SExpr; actions?: SRecordItem[] }   // `move d with { pebble := .drop }`
  | { s: 'stay'; actions?: SRecordItem[] }
  | { s: 'halt'; actions?: SRecordItem[] }
  | { s: 'wait'; count: SExpr }                          // `wait n`: stay n activations
  | { s: 'repeat'; body: SStmt[] }
  | { s: 'while'; cond: SExpr; body: SStmt[] }
  | { s: 'if'; cond: SExpr; then: SStmt[]; else?: SStmt[] }
  | { s: 'let'; name: string; type?: SType; value: SExpr }
  | { s: 'assign'; name: string; value: SExpr }
  | { s: 'call'; name: string; args: SExpr[] }
);

/** An item of a `where` block: `name args := value`, or a parameter domain in experiments. */
export type SWhereItem = {
  name: string; args: string[]; value: SExpr; span: Span;
  /** `param N : T in domain where predicate`, in experiments (both clauses optional). */
  param?: { type: SType; accepts?: SExpr };
  /** `def p (x : T) := statements` and `main := statements`, in algorithms. */
  proc?: { params: SBinder[]; body: SStmt[] };
};

export type SAttribute = { name: string; args: string[] };

export type SDecl = { span: Span; doc?: string; attrs: SAttribute[] } & (
  | { d: 'import'; path: string }
  | { d: 'inductive'; name: string; ctors: string[] }
  | { d: 'structure'; name: string; fields: SFieldType[] }
  | { d: 'def'; name: string; params: SBinder[]; type?: SType; body?: SExpr; items?: SWhereItem[] }
  | { d: 'sensor'; name: string; params: SBinder[]; type: SType; body: SExpr }
  | { d: 'task'; name: string; params: SBinder[]; type: SType; body: SExpr }
  | { d: 'goal'; name: string; goal: 'eventually' | 'eventuallyAlways' | 'safety' }
  | { d: 'algorithm'; name: string; uses: string[]; items: SWhereItem[] }
  | { d: 'experiment'; name: string; items: SWhereItem[] }
);

export type SFile = { file: string; decls: SDecl[] };
