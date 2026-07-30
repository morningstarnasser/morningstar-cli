export interface MemoryEntry {
    id: number;
    text: string;
    tags: string[];
    createdAt: string;
}
export declare function loadMemories(): MemoryEntry[];
export declare function addMemory(text: string, tags?: string[]): MemoryEntry;
export declare function removeMemory(id: number): boolean;
export declare function searchMemories(query: string): MemoryEntry[];
export declare function clearMemories(): number;
export declare function getMemoryContext(): string;
//# sourceMappingURL=memory.d.ts.map