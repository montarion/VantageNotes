// events.ts
import { Logger } from './logger.ts';
const log = new Logger({ namespace: 'Events', minLevel: 'debug' });
type Listener = (...args: any[]) => void;

class EventBus {
  private listeners: Record<string, Listener[]> = {};

  on(event: string, cb: Listener) {
    (this.listeners[event] ||= []).push(cb);
  }

  emit(event: string, ...args: any[]) {
    for (const cb of this.listeners[event] || []) {
      cb(...args);
    }
  }
}

export const eventBus = new EventBus();
