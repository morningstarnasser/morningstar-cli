export type TaskStepStatus = "pending" | "in_progress" | "completed" | "failed";
export interface TaskStep {
    id: string;
    label: string;
    tool: string;
    status: TaskStepStatus;
    detail?: string;
    duration?: number;
}
interface TaskProgressProps {
    steps: TaskStep[];
    currentLabel: string;
    startTime: number;
    tokenCount: number;
    turnNumber: number;
    maxTurns: number;
}
export declare function TaskProgress({ steps, currentLabel, startTime, tokenCount, turnNumber, maxTurns }: TaskProgressProps): import("react/jsx-runtime").JSX.Element;
export declare function createTaskStep(tool: string, args: string, status?: TaskStepStatus): TaskStep;
export {};
//# sourceMappingURL=TaskProgress.d.ts.map