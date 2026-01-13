import { Logger } from './logger.ts';
const log = new Logger({ namespace: 'Logger', minLevel: 'debug' });

export function setLS(key: string, value: any) {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch (err) {
      log.warn(`setLS failed for key "${key}"`, err);
    }
  }
  
  export function getLS<T = any>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      log.warn(`getLS failed for key "${key}"`, err);
      return null;
    }
  }

export type Note = {
    id?: string;              // from frontmatter
    path: string;             // folder/note
    title?: string;           // derived or frontmatter
    frontmatter?: any;        // parsed YAML
    dirty: boolean;           // unsaved changes
    lastLoadedAt?: number;
  };