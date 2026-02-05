// luaVM.ts
import { LuaFactory } from "npm:wasmoon";
import {
    createQuery,
    cloneQuery,
    addTagFilter,
    addOlderThanFilter,
    executeQuery,
    addCompareFilter,
    addContainsFilter,
    setSort,
    setSelect,
    setLimit,
    setExplain,
    getQueryState
} from "./lua/queryEngine.ts";
import { runDSLQuery } from "./lua/dslExecutor.ts";
import { toast } from "./toast.ts";

export async function runLuaScript(luaCode: string) {
    const factory = new LuaFactory();
    const lua = await factory.createEngine();
  
    lua.global.set("print", console.log);

    // Wrap toast API for Lua
    const luaToast = {
      notify: (msg: string) => toast.notify(msg),
      info: (msg: string) => toast.notify(msg),
      debug: (msg: string) => toast.debug(msg),
      warn: (msg: string) => toast.warn(msg),
      error: (msg: string) => toast.error(msg),
      success: (msg: string) => toast.success(msg),
    };
    lua.global.set("toast", luaToast);
    lua.global.set("PKM", {
      query() {
        const id = createQuery();
        return makeQuery(id);
      },

      query_dsl(dsl: string) {
        return runDSLQuery(dsl);
      }
    });
    
  
    const result = await lua.doString(luaCode);
    return result;
}
interface QueryState {
  filters: any[];
  selectFields?: string[];
  sort?: { field: string; direction: "asc" | "desc" };
  limit?: number;
}
function makeQuery(id: number) {
  const queryObj: any = { id };
  const querystate = getQueryState(id)

  const methods = {
    tag(value: string) {
      const newId = cloneQuery(queryObj.id);
      addTagFilter(newId, value);
      return makeQuery(newId);
    },

    olderThan(days: number) {
      const newId = cloneQuery(queryObj.id);
      addOlderThanFilter(newId, days);
      return makeQuery(newId);
    },

    where(field: string, op: string, value: any) {
      const newId = cloneQuery(queryObj.id);
      addCompareFilter(newId, field, op, value);
      return makeQuery(newId);
    },

    contains(field: string, value: string) {
      const newId = cloneQuery(queryObj.id);
      addContainsFilter(newId, field, value);
      return makeQuery(newId);
    },

    sortBy(field: string, direction = "asc") {
      const newId = cloneQuery(queryObj.id);
      setSort(newId, field, direction);
      return makeQuery(newId);
    },

    select(...fields: string[]) {
      const newId = cloneQuery(queryObj.id);
      querystate.select = fields;
      setSelect(newId, fields);
      return makeQuery(newId);
    },

    limit(n: number) {
      const newId = cloneQuery(queryObj.id);
      setLimit(newId, n);
      return makeQuery(newId);
    },

    explain() {
      const newId = cloneQuery(queryObj.id);
      setExplain(newId);
      return makeQuery(newId);
    },

    run() {
      // get the latest state from the queries map
      const state = getQueryState(queryObj.id);
    
      let results = executeQuery(queryObj.id); // apply filters
    
      // --- Sorting ---
      if (state?.sort) {
        const { field, direction } = state.sort;
        results = results.slice().sort((a, b) => {
          if (a[field] < b[field]) return direction === "asc" ? -1 : 1;
          if (a[field] > b[field]) return direction === "asc" ? 1 : -1;
          return 0;
        });
      }
    
      // --- Limit ---
      if (state?.limit !== undefined) {
        results = results.slice(0, state.limit);
      }
    
      // --- Select fields ---
      return makeResult(results, querystate?.select);
    }
  };

  // Wrap in Lua-style proxy
  return new Proxy(methods, {
      get(target, prop: string) {
        if (prop in target) return target[prop];
    
        // silently ignore 'then' to prevent Promise lookups
        if (prop === "then") return undefined;
    
        throw new Error(`Query method '${prop}' does not exist`);
      }
    });
}
  
  
  
function makeResult(notes: any[], selectFields?: string[]) {
  return {
    each(fn: Function) {
      for (let note of notes) {
        if (selectFields && selectFields.length > 0) {
          // keep only selected keys
          note = selectFields.reduce((acc: any, key) => {
            if (key in note) acc[key] = note[key];
            return acc;
          }, {});
        }
        fn(note);
      }
    }
  };
}
