// dslExecutor.ts
import {
    createQuery,
    cloneQuery,
    addTagFilter,
    addOlderThanFilter,
    executeQuery
  } from "./queryEngine.ts";
  import { parseQueryDSL } from "./queryDSL.ts";
  
  export function runDSLQuery(dsl: string) {
    let id = createQuery();
    const clauses = parseQueryDSL(dsl);
  
    for (const clause of clauses) {
      const newId = cloneQuery(id);
  
      if (clause.type === "tag") {
        addTagFilter(newId, clause.value);
      }
  
      if (clause.type === "olderThan") {
        addOlderThanFilter(newId, clause.days);
      }
  
      id = newId;
    }
  
    return executeQuery(id);
  }
  