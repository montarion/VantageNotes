// parser.ts
import { Token } from "./dslTokenizer.ts";

export type Expr =
  | { type: "tag"; value: string }
  | { type: "olderThan"; days: number }
  | { type: "not"; expr: Expr }
  | { type: "and"; left: Expr; right: Expr }
  | { type: "or"; left: Expr; right: Expr };

export function parse(tokens: Token[]): Expr {
  let pos = 0;

  function peek() { return tokens[pos]; }
  function consume() { return tokens[pos++]; }

  function parsePrimary(): Expr {
    const t = consume();

    if (!t) throw new Error("Unexpected end of input");

    if (t.type === "LPAREN") {
      const expr = parseOr();
      if (consume()?.type !== "RPAREN") {
        throw new Error("Missing ')'");
      }
      return expr;
    }

    if (t.type === "CLAUSE") {
      if (t.key === "tag") {
        return { type: "tag", value: t.value };
      }
      if (t.key === "older_than") {
        return { type: "olderThan", days: Number(t.value) };
      }
      throw new Error(`Unknown key: ${t.key}`);
    }

    throw new Error(`Unexpected token: ${t.type}`);
  }

  function parseNot(): Expr {
    if (peek()?.type === "NOT") {
      consume();
      return { type: "not", expr: parseNot() };
    }
    return parsePrimary();
  }

  function parseAnd(): Expr {
    let left = parseNot();
    while (peek()?.type === "AND") {
      consume();
      left = { type: "and", left, right: parseNot() };
    }
    return left;
  }

  function parseOr(): Expr {
    let left = parseAnd();
    while (peek()?.type === "OR") {
      consume();
      left = { type: "or", left, right: parseAnd() };
    }
    return left;
  }

  const expr = parseOr();
  if (pos < tokens.length) {
    throw new Error("Unexpected tokens at end");
  }
  return expr;
}
