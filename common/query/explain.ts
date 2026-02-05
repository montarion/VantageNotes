// query/explain.ts
import type { Expr } from "./ir.ts";
import type { Metadata } from "../metadata.ts";

export interface ExplainNode {
  expr: Expr;
  result: boolean;
  message?: string;
  children?: ExplainNode[];
}

function getField(obj: any, path: string) {
    return path.split(".").reduce((o, k) => o?.[k], obj);
  }
  
  export function explain(expr: Expr, meta: Metadata): ExplainNode {
    switch (expr.type) {
      case "and": {
        const left = explain(expr.left, meta);
        const right = explain(expr.right, meta);
        const result = left.result && right.result;
  
        return {
          expr,
          result,
          children: [left, right],
        };
      }
  
      case "or": {
        const left = explain(expr.left, meta);
        const right = explain(expr.right, meta);
        const result = left.result || right.result;
  
        return {
          expr,
          result,
          children: [left, right],
        };
      }
  
      case "not": {
        const inner = explain(expr.expr, meta);
        return {
          expr,
          result: !inner.result,
          children: [inner],
        };
      }
  
      case "compare": {
        const left = getField(meta, expr.field);
        const right = expr.value.value;
  
        let result = false;
        if (left !== undefined) {
          switch (expr.op) {
            case "==": result = left === right; break;
            case "!=": result = left !== right; break;
            case ">": result = left > right; break;
            case ">=": result = left >= right; break;
            case "<": result = left < right; break;
            case "<=": result = left <= right; break;
          }
        }
  
        return {
          expr,
          result,
          message:
            left === undefined
              ? `missing field ${expr.field}`
              : `${left} ${expr.op} ${right}`,
        };
      }
  
      case "contains": {
        const v = getField(meta, expr.field);
        const result =
          Array.isArray(v)
            ? v.includes(expr.value)
            : typeof v === "string"
            ? v.includes(expr.value)
            : false;
  
        return {
          expr,
          result,
          message:
            v === undefined
              ? `missing field ${expr.field}`
              : `contains "${expr.value}"`,
        };
      }
    }
  }