import { MarkdownBlockPlugin } from "./MarkdownBlockPlugin.ts";

export class WarningBlock extends MarkdownBlockPlugin {
  name = "warning";
  nodeName = "WarningBlock";

  start(text: string) {
    return text.startsWith(":::warning");
  }

  isEnd(text: string) {
    return text.startsWith(":::");
  }
}
