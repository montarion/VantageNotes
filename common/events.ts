// events.ts

export type AppEvents = {
    "note:saved": { docId: string };
    "note:deleted": { docId: string };
    "search:completed": { query: string; count: number };
    "sync:started": void;
    "sync:finished": { success: boolean };
    "task:toggled": { dociId: string, lineNumber: number }; // so I can toggle tasks inside queries
  };
  
  /**
   * Single global event bus class.
   * Instantiate once inside AppContext.
   */
  export class Events<E extends Record<string, any>> {
    private target = new EventTarget();
  
    on<K extends keyof E>(
      type: K,
      listener: (detail: E[K]) => void
    ) {
      const wrapped = (event: Event) => {
        const custom = event as CustomEvent<E[K]>;
        listener(custom.detail);
      };
  
      this.target.addEventListener(type as string, wrapped);
  
      // Return unsubscribe function (very ergonomic)
      return () => {
        this.target.removeEventListener(type as string, wrapped);
      };
    }
  
    once<K extends keyof E>(
      type: K,
      listener: (detail: E[K]) => void
    ) {
      const wrapped = (event: Event) => {
        const custom = event as CustomEvent<E[K]>;
        listener(custom.detail);
      };
  
      this.target.addEventListener(type as string, wrapped, { once: true });
    }
  
    off<K extends keyof E>(
      type: K,
      listener: (detail: E[K]) => void
    ) {
      // Only needed if you manually track listeners
      // Typically you use the unsubscribe returned from `on`
      this.target.removeEventListener(type as string, listener as EventListener);
    }
  
    emit<K extends keyof E>(
      type: K,
      detail: E[K]
    ) {
      this.target.dispatchEvent(
        new CustomEvent(type as string, { detail })
      );
    }
  }