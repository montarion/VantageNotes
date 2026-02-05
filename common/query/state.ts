// query/state.ts
import type { Expr } from "./ir.ts";

export interface QueryState {
  expr: Expr | null;
  error: string | null;
}
