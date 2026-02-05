// dsl/types.ts
export type DurationUnit = "ms" | "s" | "m" | "h" | "d";

export interface Duration {
  value: number;
  unit: DurationUnit;
}

export function durationToMs(d: Duration): number {
  const map: Record<DurationUnit, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return d.value * map[d.unit];
}
