export type TaskStatus = "pending" | "running" | "done" | "stopped" | "error";
export interface Task {
    id: string;
    title: string;
    status: TaskStatus;
    output: string;
    createdAt: number;
    updatedAt: number;
}
export declare class TaskRegistry {
    private clock;
    private tasks;
    private seq;
    constructor(clock?: () => number);
    create(title: string, status?: TaskStatus): Task;
    get(id: string): Task | undefined;
    list(status?: TaskStatus): Task[];
    setStatus(id: string, status: TaskStatus): Task | undefined;
    appendOutput(id: string, chunk: string): Task | undefined;
    stop(id: string): Task | undefined;
    private patch;
}
//# sourceMappingURL=task-registry.d.ts.map