// dsl/ast.ts
export type Operator = "==" | "!=" | ">" | ">=" | "<" | "<=";

export interface FieldRef {
  root: string; // "note"
  path: string[]; // ["tag"] or ["stats", "age"]
}

export type Literal =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "duration"; value: import("./types.ts").Duration };

export interface Condition {
  left: FieldRef;
  op: Operator;
  right: Literal;
}

export interface Rule {
  conditions: Condition[];
  action: {
    type: "notify";
    message: string;
  };
}
