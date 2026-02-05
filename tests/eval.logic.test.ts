// tests/eval.logic.test.ts
import { evaluate } from "../common/query/eval.ts";
import type { Expr } from "../common/query/ir.ts";
import { baseNote } from "./fixtures.ts";
import { assert, assertFalse } from "https://deno.land/std/assert/mod.ts";

Deno.test("and: both true", () => {
  const expr: Expr = {
    type: "and",
    left: {
      type: "compare",
      field: "stats.age",
      op: ">",
      value: { type: "number", value: 30 },
    },
    right: {
      type: "compare",
      field: "flags.todo",
      op: "==",
      value: { type: "boolean", value: true },
    },
  };

  assert(evaluate(expr, baseNote));
});

Deno.test("or: one true", () => {
  const expr: Expr = {
    type: "or",
    left: {
      type: "compare",
      field: "stats.age",
      op: "<",
      value: { type: "number", value: 10 },
    },
    right: {
      type: "compare",
      field: "flags.todo",
      op: "==",
      value: { type: "boolean", value: true },
    },
  };

  assert(evaluate(expr, baseNote));
});

Deno.test("not: negation", () => {
  const expr: Expr = {
    type: "not",
    expr: {
      type: "compare",
      field: "flags.archived",
      op: "==",
      value: { type: "boolean", value: true },
    },
  };

  assert(evaluate(expr, baseNote));
});
