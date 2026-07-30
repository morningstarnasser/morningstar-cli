export interface FileChangeEvent {
    type: "create" | "modify" | "delete";
    filePath: string;
    relativePath: string;
    timestamp: number;
}
export interface WatcherConfig {
    /** Directories to watch (relative to cwd) */
    dirs: string[];
    /** File extensions to watch */
    extensions: Set<string>;
    /** Patterns to ignore */
    ignorePatterns: RegExp[];
    /** Debounce interval in ms */
    debounceMs: number;
    /** Max events to buffer before flushing */
    maxBuffer: number;
}
export interface FileWatcherInstance {
    start: () => void;
    stop: () => void;
    isRunning: () => boolean;
    getEvents: () => FileChangeEvent[];
    clearEvents: () => void;
    onEvent: (cb: (event: FileChangeEvent) => void) => void;
}
/**
 * Create a file watcher for a project directory.
 */
export declare function createFileWatcher(cwd: string, config?: Partial<WatcherConfig>): FileWatcherInstance;
/**
 * Format file change events for display.
 */
export declare function formatFileChanges(events: FileChangeEvent[]): string;
/**
 * Get a summary of changes suitable for feeding back to the AI.
 */
export declare function summarizeChanges(events: FileChangeEvent[]): string;
/**
 * Detect the best directories to watch for a project.
 */
export declare function detectWatchDirs(cwd: string): string[];
//# sourceMappingURL=file-watcher.d.ts.map