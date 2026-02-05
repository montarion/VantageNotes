// query/eval.ts
import type { Expr } from "./ir.ts";
import type { Metadata } from "../metadata.ts";

function getField(obj: any, path: string) {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

export function evaluate(expr: Expr, meta: Metadata): boolean {
  switch (expr.type) {
    case "and":
      return evaluate(expr.left, meta) && evaluate(expr.right, meta);

    case "or":
      return evaluate(expr.left, meta) || evaluate(expr.right, meta);

    case "not":
      return !evaluate(expr.expr, meta);

    case "compare": {
      const left = getField(meta, expr.field);
      const right = expr.value.value;
      switch (expr.op) {
        case "==": return left === right;
        case "!=": return left !== right;
        case ">": return left > right;
        case ">=": return left >= right;
        case "<": return left < right;
        case "<=": return left <= right;
      }
    }

    case "contains": {
      const v = getField(meta, expr.field);
      return Array.isArray(v)
        ? v.includes(expr.value)
        : typeof v === "string"
        ? v.includes(expr.value)
        : false;
    }
  }
}
