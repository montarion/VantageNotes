// query/ir.ts
export type Value =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean };

export type Expr =
  | { type: "and"; left: Expr; right: Expr }
  | { type: "or"; left: Expr; right: Expr }
  | { type: "not"; expr: Expr }
  | {
      type: "compare";
      field: string;       // "tags", "stats.age"
      op: "==" | "!=" | ">" | ">=" | "<" | "<=";
      value: Value;
    }
  | {
      type: "contains";
      field: string;
      value: string;
    };
