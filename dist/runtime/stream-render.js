/** Coalesce visual updates only. Raw deltas/transcripts remain untouched. */
export function createStreamRenderScheduler(render, intervalMs = 33, schedule = setTimeout, cancel = clearTimeout) {
    let timer;
    let first = true;
    const reset = () => { if (timer !== undefined)
        cancel(timer); timer = undefined; first = true; };
    const flush = () => {
        if (timer === undefined)
            return;
        cancel(timer);
        timer = undefined;
        render();
    };
    return {
        request: () => {
            if (first) {
                first = false;
                render();
                return;
            }
            if (timer === undefined)
                timer = schedule(() => { timer = undefined; render(); }, intervalMs);
        },
        flush,
        reset,
    };
}
//# sourceMappingURL=stream-render.js.map