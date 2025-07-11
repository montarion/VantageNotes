// metadataStore.ts

import { Logger } from '../common/logger.ts';
const log = new Logger({ namespace: 'Metadata', minLevel: 'debug' });

export interface Header {
    level: number;
    text: string;
    line: number;
  }
export interface Tag{ //TODO: add page
    name: string;
    line: number;
    context: string;

}
  export interface Task {
    text: string;
    checked: boolean;
    line: number;
  }
  
  export interface CodeBlock {
    language: string | null;
    fromLine: number;
    toLine: number;
  }

  export interface Wikilink {
    target: string;       // Page reference, possibly with section: "Page#Section"
    alias?: string;       // Optional display text
    line: number;         // Line number where the link occurs
    context: string;      // Full line or surrounding content
  }
  
  export interface Hyperlink {
    url: string;
    label: string;
    line: number;
    context: string;
  }

  export interface Imagelink {
    url: string;
    altText: string;
    line: number;
    context: string;
  }
  
  export interface PageMetadata {
    lineCount: number;
    tags: Tag[];
    headers: Header[];
    tasks: Task[];
    codeBlocks: CodeBlock[];
    wikilinks: Wikilink[];
    hyperlinks: Hyperlink[];
    images: Imagelink[];
  }
  
  class MetadataStore {
    private tags: Tag[] = [];
    private headers: Header[] = [];
    private tasks: Task[] = [];
    private codeBlocks: CodeBlock[] = [];
    private wikilinks: Wikilink[] = [];
    private hyperlinks: Hyperlink[] = [];
    private imagelinks: Imagelink[] = [];
    private lineCount = 0;
  

    updateTags(newTags: Required<Tag>[]) {
        for (const newTag of newTags) {
          const newTagString = JSON.stringify(newTag);
      
          const exists = this.tags.some(tag => JSON.stringify(tag) === newTagString);
      
          if (!exists) {
            this.tags.push(newTag);
          }
        }
      
      }
      
    updateHeaders(newHeaders: Header[]) {
        for (const newHeader of newHeaders) {
            const newHeaderString = JSON.stringify(newHeader);
        
            const exists = this.headers.some(header => JSON.stringify(header) === newHeaderString);
        
            if (!exists) {
              this.headers.push(newHeader);
            }
          }
        
    }
    updateTasks(newTasks: Task[]) {
        for (const newTask of newTasks) {
            const newTaskString = JSON.stringify(newTask);
        
            const exists = this.tasks.some(tag => JSON.stringify(tag) === newTaskString);
        
            if (!exists) {
              this.tasks.push(newTask);
            }
          }
        
    }
    updateLineCount(lines: number) {
      this.lineCount = lines;
    }

    updateCodeBlocks(newBlocks: CodeBlock[]) {
      this.codeBlocks = newBlocks;
    }

    updateWikilinks(newLinks: Wikilink[]) {
      for (const link of newLinks) {
        const key = JSON.stringify(link);
        const exists = this.wikilinks.some(l => JSON.stringify(l) === key);
        if (!exists) {
          this.wikilinks.push(link);
        }
      }
    }
    
    updateHyperlinks(newLinks: Hyperlink[]) {
      for (const link of newLinks) {
        const linkString = JSON.stringify(link);
        const exists = this.hyperlinks.some(existing => JSON.stringify(existing) === linkString);
        if (!exists) {
          this.hyperlinks.push(link);
        }
      }
    }

    updateImages(newLinks: Imagelink[]) {
      for (const link of newLinks) {
        const linkString = JSON.stringify(link);
        const exists = this.imagelinks.some(existing => JSON.stringify(existing) === linkString);
        if (!exists) {
          this.imagelinks.push(link);
        }
      }
    }
  
    getMetadata(): PageMetadata {
      return {
        lineCount: this.lineCount,
        tags: this.tags,
        headers: this.headers,
        tasks: this.tasks,
        codeBlocks: this.codeBlocks,
        wikilinks: this.wikilinks,
        hyperlinks: this.hyperlinks,
        images: this.imagelinks
      };
    }
  }
  
  export const metadataStore = new MetadataStore();
  