// dsl/eval.ts
import type { Metadata } from "../metadata.ts";
import type { Rule, Condition } from "./ast.ts";
import { durationToMs } from "./types.ts";

function getFieldValue(meta: Metadata, ref: Condition["left"]) {
  let current: any = (meta as any)[ref.root];
  for (const p of ref.path) {
    current = current?.[p];
  }
  return current;
}

function compare(left: any, op: string, right: any): boolean {
  switch (op) {
    case "==": return left === right;
    case "!=": return left !== right;
    case ">": return left > right;
    case ">=": return left >= right;
    case "<": return left < right;
    case "<=": return left <= right;
    default: return false;
  }
}

export function evaluateRule(rule: Rule, meta: Metadata): boolean {
  return rule.conditions.every(cond => {
    const left = getFieldValue(meta, cond.left);

    let right: any = cond.right.value;
    if (cond.right.type === "duration") {
      right = durationToMs(cond.right.value);
    }

    return compare(left, cond.op, right);
  });
}
