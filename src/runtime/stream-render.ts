/** Coalesce visual updates only. Raw deltas/transcripts remain untouched. */
export function createStreamRenderScheduler(
  render: () => void,
  intervalMs = 33,
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout> = setTimeout,
  cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
): { request: () => void; flush: () => void; reset: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let first = true;
  const reset = () => { if (timer !== undefined) cancel(timer); timer = undefined; first = true; };
  const flush = () => {
    if (timer === undefined) return;
    cancel(timer); timer = undefined; render();
  };
  return {
    request: () => {
      if (first) { first = false; render(); return; }
      if (timer === undefined) timer = schedule(() => { timer = undefined; render(); }, intervalMs);
    },
    flush,
    reset,
  };
}
