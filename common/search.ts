
export interface SearchResult {
    id: string;
    score?: number;
    [key: string]: any;
  }
  
  export type SearchMode = "remote" | "client";
  
  export interface SearchConfig {
    mode: SearchMode;
  
    // Remote config
    endpoint?: string;
    fetchInit?: RequestInit;
  
    // Client config
    documents?: any[];
    fields?: string[];     // fields to index
    ref?: string;          // id field (default: "id")
  }

  export class Search {
    private mode: "remote" | "client";
    private endpoint?: string;
    private fetchInit?: RequestInit;
  
    private lunrIndex: any = null;
    private documents: Map<string, any> = new Map();
  
    constructor(private config: SearchConfig) {
      this.mode = config.mode;
  
      if (this.mode === "remote") {
        
        this.endpoint = "/api/search";
        this.fetchInit = config.fetchInit;
      }
  
      if (this.mode === "client") {
        if (!config.documents || !config.fields) {
          throw new Error("Client mode requires documents and fields");
        }
        this.buildClientIndex(
          config.documents,
          config.fields,
          config.ref ?? "id"
        );
      }
    }
  
    // ---------- PUBLIC SEARCH ----------
  
    async search(query: string): Promise<SearchResult[]> {
      if (!query.trim()) return [];
  
      if (this.mode === "remote") {
        return this.searchRemote(query);
      }
  
      return this.searchClient(query);
    }
  
    // ---------- REMOTE SEARCH ----------
  
    private async searchRemote(query: string): Promise<SearchResult[]> {
      const url = new URL(this.endpoint!, window.location.origin);
      url.searchParams.set("q", query);
  
      const res = await fetch(url.toString(), {
        method: "GET",
        ...this.fetchInit,
      });
  
      if (!res.ok) {
        throw new Error(`Search request failed: ${res.status}`);
      }
  
      return await res.json();
    }
  
    // ---------- CLIENT SEARCH (LUNR) ----------
  
    private async searchClient(query: string): Promise<SearchResult[]> {
      if (!this.lunrIndex) return [];
  
      const results = this.lunrIndex.search(query);
  
      return results.map((r: any) => {
        const doc = this.documents.get(r.ref);
        return {
          ...doc,
          score: r.score,
        };
      });
    }
  
    private async buildClientIndex(
      docs: any[],
      fields: string[],
      ref: string
    ) {
      const lunr = (await import("npm:lunr")).default;
  
      this.lunrIndex = lunr(function () {
        this.ref(ref);
  
        fields.forEach((field) => {
          this.field(field);
        });
  
        docs.forEach((doc) => {
          this.add(doc);
        });
      });
  
      docs.forEach((doc) => {
        this.documents.set(doc[ref], doc);
      });
    }
  }