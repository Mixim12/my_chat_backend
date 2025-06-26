/**
 * Logger service for application-wide logging
 * Provides consistent logging format and levels
 */

// Log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

// Current log level (can be set from environment variable)
const currentLogLevel = process.env.LOG_LEVEL ? 
  (LogLevel[process.env.LOG_LEVEL as keyof typeof LogLevel] || LogLevel.INFO) : 
  LogLevel.INFO;

// Logger interface
interface ILogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  fatal(message: string, ...args: any[]): void;
}

// Logger implementation
class Logger implements ILogger {
  private context: string;
  
  constructor(context: string) {
    this.context = context;
  }
  
  /**
   * Format log message with timestamp, level, context, and message
   */
  private formatLog(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.padEnd(5)}] [${this.context}] ${message}`;
  }
  
  /**
   * Log debug message
   */
  debug(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.DEBUG) {
      console.debug(this.formatLog('DEBUG', message), ...args);
    }
  }
  
  /**
   * Log info message
   */
  info(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.INFO) {
      console.info(this.formatLog('INFO', message), ...args);
    }
  }
  
  /**
   * Log warning message
   */
  warn(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.WARN) {
      console.warn(this.formatLog('WARN', message), ...args);
    }
  }
  
  /**
   * Log error message
   */
  error(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.ERROR) {
      console.error(this.formatLog('ERROR', message), ...args);
    }
  }
  
  /**
   * Log fatal message
   */
  fatal(message: string, ...args: any[]): void {
    if (currentLogLevel <= LogLevel.FATAL) {
      console.error(this.formatLog('FATAL', message), ...args);
    }
  }
}

/**
 * Create a logger for a specific context
 */
export function createLogger(context: string): ILogger {
  return new Logger(context);
}

// Default logger
export default createLogger('App'); 