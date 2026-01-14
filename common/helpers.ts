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


  export function debounce<F extends (...args: any[]) => void>(
    fn: F,
    wait: number
  ) {
    let timeout: number | undefined;
  
    return (...args: Parameters<F>) => {
      if (timeout !== undefined) clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), wait);
    };
  }

  export function debounceAsync<F extends (...args: any[]) => Promise<any>>(
    fn: F,
    wait: number
  ) {
    let timeout: number | undefined;
    let resolveList: ((value: Awaited<ReturnType<F>>) => void)[] = [];
  
    return (...args: Parameters<F>): Promise<Awaited<ReturnType<F>>> => {
      if (timeout !== undefined) clearTimeout(timeout);
  
      return new Promise((resolve) => {
        resolveList.push(resolve);
  
        timeout = setTimeout(async () => {
          const result = await fn(...args);
          resolveList.forEach((r) => r(result));
          resolveList = [];
        }, wait);
      });
    };
  }