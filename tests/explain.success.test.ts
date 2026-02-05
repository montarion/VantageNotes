// tests/explain.success.test.ts
import { explain } from "../common/query/explain.ts";
import { printExplain } from "../common/query/explainPrint.ts";
import type { Expr } from "../common/query/ir.ts";
import { log } from "../log.ts";
import { baseNote } from "./fixtures.ts";
import { assertStringIncludes } from "https://deno.land/std/assert/mod.ts";

Deno.test("explain: successful AND", () => {
  const expr: Expr = {
    type: "and",
    left: {
      type: "compare",
      field: "flags.todo",
      op: "==",
      value: { type: "boolean", value: true },
    },
    right: {
      type: "compare",
      field: "stats.age",
      op: ">",
      value: { type: "number", value: 30 },
    },
  };

  const tree = explain(expr, baseNote);
  const text = printExplain(tree);
  log(text)
  assertStringIncludes(text, "flags.todo");
  assertStringIncludes(text, "stats.age");
  assertStringIncludes(text, "✔");
});
