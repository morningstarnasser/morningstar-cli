/** Coalesce visual updates only. Raw deltas/transcripts remain untouched. */
export declare function createStreamRenderScheduler(render: () => void, intervalMs?: number, schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>, cancel?: (timer: ReturnType<typeof setTimeout>) => void): {
    request: () => void;
    flush: () => void;
    reset: () => void;
};
//# sourceMappingURL=stream-render.d.ts.map