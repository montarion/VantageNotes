// query/explainPrint.ts
import type { ExplainNode } from "./explain.ts";

export function printExplain(
  node: ExplainNode,
  indent = "",
  isLast = true,
): string {
  const branch = indent + (isLast ? "└─ " : "├─ ");
  const nextIndent = indent + (isLast ? "   " : "│  ");

  const status = node.result ? "✔" : "✘";
  const label =
    node.expr.type.toUpperCase() +
    (node.message ? ` (${node.message})` : "");

  let out = `${branch}${label} ${status}\n`;

  if (node.children) {
    node.children.forEach((c, i) => {
      out += printExplain(c, nextIndent, i === node.children!.length - 1);
    });
  }

  return out;
}
