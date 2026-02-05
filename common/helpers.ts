import { HighlightStyle, tags } from "npm:@codemirror/highlight";

import { Logger } from './logger.ts';
const log = new Logger({ namespace: 'helper', minLevel: 'debug' });

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

  export function previousLineIsQuote(m: RegExpExecArray): boolean {
    const text = m.input;
    const matchStart = m.index;
  
    // At start of document → first quote line
    if (matchStart === 0) return false;
  
    // Find start of previous line
    const prevLineEnd = matchStart - 1; // char before \n
    const prevLineStart =
      text.lastIndexOf("\n", prevLineEnd - 1) + 1;
  
    const prevLine = text.slice(prevLineStart, prevLineEnd);
  
    return /^\s*>/.test(prevLine);
  }

  export function findIndentedBlock(
    text: string,
    start: number
  ): { from: number; to: number } {
    let pos = start;
    let end = start;
  
    while (pos < text.length) {
      const lineEnd = text.indexOf("\n", pos);
      const nextLineEnd = lineEnd === -1 ? text.length : lineEnd + 1;
      const line = text.slice(pos, nextLineEnd);
  
      if (!/^ {4}/.test(line)) break;
  
      end = nextLineEnd;
      pos = nextLineEnd;
    }
  
    return { from: start, to: end };
  }

  export function findUntilBlankLine(
    text: string,
    start: number,
  ) {
    const match = /\n\s*\n/.exec(text.slice(start));
  
    if (!match) {
      return { from: start, to: text.length };
    }
  
    return {
      from: start,
      to: start + match.index,
    };
  }

  /*
  export const blockHighlightStyle = HighlightStyle.define([
    // Keywords
    { tag: tags.keyword, class: "cm-keyword" },
    { tag: tags.controlKeyword, class: "cm-keyword" },
    { tag: tags.operatorKeyword, class: "cm-keyword" },
  
    // Names
    { tag: tags.variableName, class: "cm-variable" },
    { tag: tags.typeName, class: "cm-type" },
    { tag: tags.className, class: "cm-class" },
    { tag: tags.namespace, class: "cm-namespace" },
  
    // Literals
    { tag: tags.string, class: "cm-string" },
    { tag: tags.string.special, class: "cm-string-special" },
    { tag: tags.number, class: "cm-number" },
    { tag: tags.bool, class: "cm-bool" },
    { tag: tags.null, class: "cm-null" },
  
    // Comments
    { tag: tags.comment, class: "cm-comment" },
    { tag: tags.comment.line, class: "cm-comment" },
    { tag: tags.comment.block, class: "cm-comment" },
  
    // Operators & punctuation
    { tag: tags.operator, class: "cm-operator" },
    { tag: tags.punctuation, class: "cm-punctuation" },
    { tag: tags.bracket, class: "cm-bracket" },
  
    // Properties & attributes
    { tag: tags.propertyName, class: "cm-property" },
    { tag: tags.attributeName, class: "cm-attribute" },
  
    // Special syntax
    { tag: tags.escape, class: "cm-escape" },
    { tag: tags.regexp, class: "cm-regexp" },
  
    // Markdown / meta
    { tag: tags.heading, class: "cm-heading" },
    { tag: tags.strong, class: "cm-strong" },
    { tag: tags.emphasis, class: "cm-emphasis" },
    { tag: tags.link, class: "cm-link" },
    { tag: tags.url, class: "cm-url" },
  ]);
  */