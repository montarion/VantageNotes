// logging.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  namespace?: string;
  minLevel?: LogLevel;
}

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const globalConfig = {
  minLevel: 'debug' as LogLevel,
  enabledNamespaces: new Set<string>(),

  enableNamespace(ns: string) {
    this.enabledNamespaces.add(ns);
  },

  disableNamespace(ns: string) {
    this.enabledNamespaces.delete(ns);
  },

  enableAll() {
    this.enabledNamespaces.clear(); // empty means no filtering
  },

  setMinLevel(level: LogLevel) {
    this.minLevel = level;
  }
};

export class Logger {
  private namespace?: string;

  constructor(options: LoggerOptions = {}) {
    this.namespace = options.namespace;
  }

  private shouldLog(level: LogLevel) {
    const allowed =
      globalConfig.enabledNamespaces.size === 0 ||
      (this.namespace && globalConfig.enabledNamespaces.has(this.namespace));
    return allowed && levelPriority[level] >= levelPriority[globalConfig.minLevel];
  }

  private prefix(level: LogLevel) {
    const timestamp = new Date().toISOString();
    const ns = this.namespace ? `[${this.namespace}]` : '';
    return `[${timestamp}]${ns} ${level.toUpperCase()}:`;
  }

  debug(msg: string, ...args: any[]) {
    if (this.shouldLog('debug')) console.debug(this.prefix('debug'), msg, ...args);
  }

  info(msg: string, ...args: any[]) {
    if (this.shouldLog('info')) console.info(this.prefix('info'), msg, ...args);
  }

  warn(msg: string, ...args: any[]) {
    if (this.shouldLog('warn')) console.warn(this.prefix('warn'), msg, ...args);
  }

  error(msg: string, ...args: any[]) {
    if (this.shouldLog('error')) console.error(this.prefix('error'), msg, ...args);
  }
}

export const Logging = globalConfig;
