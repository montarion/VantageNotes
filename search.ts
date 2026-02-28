import FlexSearch from "npm:flexsearch";
import { Metadata } from "./common/metadata.ts";
import { Logger } from "./common/logger.ts";
const log = new Logger({ namespace: "Search" });

export const searchindex = new FlexSearch.Document({
    document: { id: "docId", index: ["text", "title", "tags", "entities", "wikilinks"] },
  });

export function addToIndex(index: FlexSearch.Document, docName: string, text: string, metadata: Metadata) {
    const frontmatter = metadata.frontmatter ?? {};
    const title = frontmatter.title ?? docName;
    const tags = metadata.tags ?? [];
  
    const entitiesBuckets = metadata.entities ?? {};
    const entities = Object.values(entitiesBuckets)
      .flatMap(bucket => Object.keys(bucket))
      .join(" ");
  
    const wikilinksBuckets = metadata.links?.wikilinks ?? {};
    const wikilinks = Object.keys(wikilinksBuckets).join(" ");
  
    index.add({
      docId: docName,
      text,
      title,
      tags: Object.keys(metadata.tags).join(" "),
      entities,
      wikilinks
    });
  }