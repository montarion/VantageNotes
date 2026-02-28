// db-interface.ts

export interface DBInterface {
    exec(sql: string): Promise<void>;
    query(sql: string): Promise<void>;
    run(sql: string, params?: any[]): Promise<void>;
    all(sql: string, params?: any[]): Promise<any[]>;
    transaction<T>(fn: (tx: DBInterface) => Promise<T>): Promise<T>;
    pquery(prql: string): Promise<void>;
  }