from datetime import datetime
from typing import Optional, Set
import inspect

class LogLevel:
    DEBUG = 'debug'
    INFO = 'info'
    WARN = 'warn'
    ERROR = 'error'

    PRIORITY = {
        DEBUG: 10,
        INFO: 20,
        WARN: 30,
        ERROR: 40,
    }

class GlobalLoggingConfig:
    def __init__(self):
        self.min_level = LogLevel.DEBUG
        self.enabled_namespaces: Set[str] = set()

    def enable_namespace(self, ns: str):
        self.enabled_namespaces.add(ns)

    def disable_namespace(self, ns: str):
        self.enabled_namespaces.discard(ns)

    def enable_all(self):
        self.enabled_namespaces.clear()  # empty means no filtering

    def set_min_level(self, level: str):
        self.min_level = level

Logging = GlobalLoggingConfig()

class Logger:
    """Usage:
        from logger import Log, Logger
        log("Hello world!")         # ← treated as log.info("Hello world!")
        log.debug("Debugging...")
        log.warn("Something is off")
        log.error("Something broke")

        Logging.set_min_level("warn")
        log("This won't show because it's info")
        log.error("Still shows")
    """
    def __init__(self, namespace: Optional[str] = None):
        self.namespace = namespace

    def _should_log(self, level: str) -> bool:
        allowed = (
            not Logging.enabled_namespaces or
            (self.namespace and self.namespace in Logging.enabled_namespaces)
        )
        return allowed and LogLevel.PRIORITY[level] >= LogLevel.PRIORITY[Logging.min_level]

    def _prefix(self, level: str) -> str:
        timestamp = datetime.utcnow().isoformat()

        # Get caller's file and line number
        frame = inspect.currentframe()
        outer_frames = inspect.getouterframes(frame)
        # Index 3 corresponds to the actual caller (for debug/info/etc); adjust if needed
        caller_frame = outer_frames[3]
        filename = caller_frame.filename.rsplit("/")[-1]
        lineno = caller_frame.lineno

        location = f"({filename}:{lineno})"
        ns = f"[{self.namespace}]" if self.namespace else ""
        return f"[{timestamp}]{ns} {level.upper()}: {location}"

    def debug(self, msg: str, *args):
        if self._should_log(LogLevel.DEBUG):
            print(self._prefix(LogLevel.DEBUG), msg, *args)

    def info(self, msg: str, *args):
        if self._should_log(LogLevel.INFO):
            print(self._prefix(LogLevel.INFO), msg, *args)

    def warn(self, msg: str, *args):
        if self._should_log(LogLevel.WARN):
            print(self._prefix(LogLevel.WARN), msg, *args)

    def error(self, msg: str, *args):
        if self._should_log(LogLevel.ERROR):
            print(self._prefix(LogLevel.ERROR), msg, *args)

    def __call__(self, msg: str, *args):
        self.info(msg, *args)

# Global default logger
log = Logger()
