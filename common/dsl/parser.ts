// dsl/parser.ts
import type { Rule, Condition, FieldRef, Literal } from "./ast.ts";

const CONDITION_RE =
  /(\w+(?:\.\w+)*)\s*(==|!=|>=|<=|>|<)\s*(.+)/;

const DURATION_RE = /^(\d+)(ms|s|m|h|d)$/;

function parseField(input: string): FieldRef {
  const [root, ...path] = input.split(".");
  return { root, path };
}

function parseLiteral(input: string): Literal {
  input = input.trim();

  if (input.startsWith('"')) {
    return { type: "string", value: JSON.parse(input) };
  }

  if (/^\d+$/.test(input)) {
    return { type: "number", value: Number(input) };
  }

  const dur = input.match(DURATION_RE);
  if (dur) {
    return {
      type: "duration",
      value: { value: Number(dur[1]), unit: dur[2] as any },
    };
  }

  throw new Error(`Invalid literal: ${input}`);
}

function parseCondition(line: string): Condition {
  const match = line.match(CONDITION_RE);
  if (!match) throw new Error(`Invalid condition: ${line}`);

  return {
    left: parseField(match[1]),
    op: match[2] as any,
    right: parseLiteral(match[3]),
  };
}

export function parseRule(source: string): Rule {
  const lines = source
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  if (!lines[0]?.startsWith("when")) {
    throw new Error("Rule must start with 'when'");
  }

  const conditions: Condition[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("when ")) {
      conditions.push(parseCondition(line.slice(5)));
    } else if (line.startsWith("and ")) {
      conditions.push(parseCondition(line.slice(4)));
    } else if (line.startsWith("then ")) {
      const m = line.match(/notify\("(.+)"\)/);
      if (!m) throw new Error("Invalid action");
      return {
        conditions,
        action: { type: "notify", message: m[1] },
      };
    }
  }

  throw new Error("Missing 'then' clause");
}
