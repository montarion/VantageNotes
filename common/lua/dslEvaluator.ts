import { Expr } from "./dslParser.ts";

export function matches(note: any, expr: Expr): boolean {
  switch (expr.type) {
    case "tag":
      return note.tags.includes(expr.value);

    case "olderThan":
      return note.ageDays > expr.days;

    case "not":
      return !matches(note, expr.expr);

    case "and":
      return matches(note, expr.left) && matches(note, expr.right);

    case "or":
      return matches(note, expr.left) || matches(note, expr.right);
  }
}