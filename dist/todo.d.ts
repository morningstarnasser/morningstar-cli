export interface TodoItem {
    id: number;
    text: string;
    done: boolean;
    priority: "low" | "normal" | "high";
    createdAt: string;
    doneAt?: string;
}
export declare function loadTodos(): TodoItem[];
export declare function addTodo(text: string, priority?: "low" | "normal" | "high"): TodoItem;
export declare function toggleTodo(id: number): TodoItem | null;
export declare function removeTodo(id: number): boolean;
export declare function clearDoneTodos(): number;
export declare function clearAllTodos(): number;
export declare function getTodoStats(): {
    total: number;
    done: number;
    open: number;
    high: number;
};
//# sourceMappingURL=todo.d.ts.map