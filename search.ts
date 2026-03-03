import Fuse from "npm:fuse.js";
import { Metadata } from "./common/metadata.ts";
import { Logger } from "./common/logger.ts";

const log = new Logger({ namespace: "Search" });

/**
 * The actual document stored in the index.
 * Now strongly typed with your Metadata interface.
 */
export interface SearchDocument {
  docId: string;
  text: string;
  metadata: Metadata;
}

class FuseDocumentIndex {
  private documents: SearchDocument[] = [];
  private fuse: Fuse<SearchDocument>;

  constructor() {
    this.fuse = new Fuse(this.documents, {
      includeScore: true,
      threshold: 0.35,
      keys: [
        {
          name: "metadata.frontmatter.title",
          weight: 0.4,
        },
        {
          name: "text",
          weight: 0.3,
        },
        {
          name: "metadata.tags",
          weight: 0.1,
        },
        {
          name: "metadata.entities",
          weight: 0.1,
          getFn: (doc) =>
            Object.values(doc.metadata.entities ?? {})
              .flatMap((bucket: any) => Object.keys(bucket ?? {})),
        },
        {
          name: "metadata.links.wikilinks",
          weight: 0.1,
          getFn: (doc) =>
            Object.keys(doc.metadata.links?.wikilinks ?? {}),
        },
      ],
    });
  }

  add(doc: SearchDocument) {
    // Replace if exists
    this.documents = this.documents.filter(d => d.docId !== doc.docId);
    this.documents.push(doc);

    // Rebuild index
    this.fuse = new Fuse(this.documents, this.fuse.options);
  }

  search(query: string) {
    return this.fuse.search(query).map(r => r.item);
  }
}

export const searchindex = new FuseDocumentIndex();

/**
 * Signature unchanged.
 */
export function addToIndex(
  docName: string,
  text: string,
  metadata: Metadata
) {
  searchindex.add({
    docId: docName,
    text,
    metadata,
  });

  log.debug(`Indexed ${docName}`);
}