// actions.ts
export interface NoteActions {
    addTag(tag: string): void;
    removeTag(tag: string): void;
    setFlag(name: string, value: boolean): void;
    notify(msg: string): void;
  }