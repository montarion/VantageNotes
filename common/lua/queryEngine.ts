// queryEngine.ts
let nextQueryId = 1;
type Filter =
  | { type: "tag"; value: string }
  | { type: "olderThan"; days: number }
  | { type: "compare"; field: string; op: string; value: any }
  | { type: "contains"; field: string; value: string };

type SortSpec = {
  field: string;
  direction: "asc" | "desc";
};

type QueryData = {
    filters: Filter[];
    sort?: SortSpec;
    select?: string[];  // fields to return
    limit?: number;     // max number of results
    explain?: boolean;  // flag to output query plan
  };

const queries = new Map<number, QueryData>();

export const sampleNotes = {
    1: { id: 1, title: "Fix parser", tags: ["todo"], ageDays: 40 },
    2: { id: 2, title: "Write docs", tags: ["todo"], ageDays: 10 },
    3: { id: 3, title: "Buy coffee", tags: ["misc"], ageDays: 5 },
  };
export function createQuery() {
  const id = nextQueryId++;
  queries.set(id, { filters: [] });
  return id;
}

export function cloneQuery(id: number) {
  const q = queries.get(id);
  const newId = nextQueryId++;
  queries.set(newId, { filters: [...q.filters] });
  return newId;
}

export function addTagFilter(id: number, value: string) {
  queries.get(id)?.filters.push({ type: "tag", value });
}

export function addOlderThanFilter(id: number, days: number) {
  queries.get(id)?.filters.push({ type: "olderThan", days });
}

export function getQueryState(id: number) {
    return queries.get(id);
}
export function addCompareFilter(
    id: number,
    field: string,
    op: string,
    value: any
  ) {
    queries.get(id)?.filters.push({ type: "compare", field, op, value });
  }
  
  export function addContainsFilter(
    id: number,
    field: string,
    value: string
  ) {
    queries.get(id)?.filters.push({ type: "contains", field, value });
  }
  
  export function setSort(
    id: number,
    field: string,
    direction: "asc" | "desc"
  ) {
    queries.get(id)!.sort = { field, direction };
  }

  export function setSelect(id: number, fields: string[]) {
    queries.get(id)!.select = fields;
  }
  
  export function setLimit(id: number, n: number) {
    queries.get(id)!.limit = n;
  }
  
  export function setExplain(id: number, flag = true) {
    queries.get(id)!.explain = flag;
  }

  export function executeQuery(id: number) {
    const q = queries.get(id);
    if (!q) return [];
  
    if (q.explain) {
      console.log("Query Plan:", JSON.stringify(q, null, 2));
    }
  
    let results = Object.values(sampleNotes).filter(note =>
      q.filters.every(f => {
        switch (f.type) {
          case "tag": return note.tags.includes(f.value);
          case "olderThan": return note.ageDays > f.days;
          case "compare": {
            const v = note[f.field];
            switch (f.op) {
              case ">": return v > f.value;
              case ">=": return v >= f.value;
              case "<": return v < f.value;
              case "<=": return v <= f.value;
              case "==": return v === f.value;
              case "!=": return v !== f.value;
            }
          }
          case "contains": return typeof note[f.field] === "string" && note[f.field].includes(f.value);
        }
      })
    );
  
    if (q.sort) {
      const { field, direction } = q.sort;
      results.sort((a, b) => (direction === "asc" ? (a[field] > b[field] ? 1 : -1) : (a[field] < b[field] ? 1 : -1)));
    }
  
    if (q.select) {
      results = results.map(n => {
        const out: any = {};
        for (const f of q.select!) out[f] = n[f];
        return out;
      });
    }
  
    if (q.limit != null) results = results.slice(0, q.limit);
  
    return results;
  }
  
