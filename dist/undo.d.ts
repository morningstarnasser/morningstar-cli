export interface FileChange {
    type: "write" | "edit" | "delete";
    filePath: string;
    previousContent: string | null;
    newContent: string | null;
    timestamp: string;
    description: string;
}
export declare function trackChange(change: FileChange): void;
export declare function getLastChange(): FileChange | null;
export declare function undoLastChange(): {
    success: boolean;
    message: string;
};
export declare function getUndoStack(): FileChange[];
export declare function getUndoStackSize(): number;
export declare function clearUndoStack(): void;
export declare function captureBeforeState(filePath: string): string | null;
//# sourceMappingURL=undo.d.ts.map