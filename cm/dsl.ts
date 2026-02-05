// cm6/dsl.ts
import { StreamLanguage } from "npm:@codemirror/language";

export const dslLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match(/\b(when|and|then)\b/)) return "keyword";
    if (stream.match(/\bnotify\b/)) return "function";
    if (stream.match(/==|!=|>=|<=|>|</)) return "operator";
    if (stream.match(/"[^"]*"/)) return "string";
    if (stream.match(/\d+(ms|s|m|h|d)/)) return "number";
    if (stream.match(/\w+(\.\w+)*/)) return "variableName";
    stream.next();
    return null;
  },
});
