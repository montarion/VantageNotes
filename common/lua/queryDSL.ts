// queryDSL.ts
type Clause =
  | { type: "tag"; value: string }
  | { type: "olderThan"; days: number };

export function parseQueryDSL(input: string): Clause[] {
  return input
    .split(/\s+AND\s+/i)
    .map(part => part.trim())
    .map(part => {
      const [key, raw] = part.split(":");
      if (!key || !raw) {
        throw new Error(`Invalid clause: ${part}`);
      }

      switch (key.toLowerCase()) {
        case "tag":
          return { type: "tag", value: raw };

        case "older_than":
          return { type: "olderThan", days: Number(raw) };

        default:
          throw new Error(`Unknown key: ${key}`);
      }
    });
}
