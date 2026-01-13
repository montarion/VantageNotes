export type Token =
  | { type: "AND" | "OR" | "NOT" }
  | { type: "LPAREN" | "RPAREN" }
  | { type: "CLAUSE"; key: string; value: string };

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const re = /\s*(AND|OR|NOT|\(|\)|[a-z_]+:[^()\s]+)/gi;

  let match;
  while ((match = re.exec(input))) {
    const text = match[1];

    if (text === "(") tokens.push({ type: "LPAREN" });
    else if (text === ")") tokens.push({ type: "RPAREN" });
    else if (/^AND$/i.test(text)) tokens.push({ type: "AND" });
    else if (/^OR$/i.test(text)) tokens.push({ type: "OR" });
    else if (/^NOT$/i.test(text)) tokens.push({ type: "NOT" });
    else {
      const [key, value] = text.split(":");
      tokens.push({ type: "CLAUSE", key, value });
    }
  }

  return tokens
}