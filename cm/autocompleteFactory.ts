import {
    Completion,
    CompletionContext,
    CompletionResult,
  } from "npm:@codemirror/autocomplete";
  
  /**
   * Generic conditional completion source
   */
  export type CompletionTrigger = {
    /** Regex to match before the cursor */
    match: RegExp;
  
    /** Optional extra condition */
    when?: (context: CompletionContext, match: RegExpMatchArray) => boolean;
  
    /** How many chars from the match should be replaced */
    replaceFrom?: (match: RegExpMatchArray) => number;
  };
  
  export type CompletionProvider = (
    context: CompletionContext,
    match: RegExpMatchArray
  ) => Completion[] | Promise<Completion[]>;
  
  export function conditionalCompletion(
    trigger: CompletionTrigger,
    provider: CompletionProvider
  ) {
    return async (
      context: CompletionContext
    ): Promise<CompletionResult | null> => {
      const match = context.matchBefore(trigger.match);
      if (!match) return null;
  
      if (trigger.when && !trigger.when(context, match)) {
        return null;
      }
  
      const from =
        trigger.replaceFrom?.(match) ??
        match.from;
  
      const options = await provider(context, match);
  
      if (!options || options.length === 0) return null;
  
      return {
        from,
        options,
      };
    };
  }
  