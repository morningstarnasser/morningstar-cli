// ─── TaskRegistry-light (#6, from claw-code lane 4) ──────────────────────────
// In-memory task lifecycle: create / get / list / update / append output / stop.
// Lets Carry track long-running or backgrounded work as first-class records.
// Pure data structure (no subprocess execution) — fully testable.
export class TaskRegistry {
    clock;
    tasks = new Map();
    seq = 0;
    constructor(clock = Date.now) {
        this.clock = clock;
    }
    create(title, status = "pending") {
        const now = this.clock();
        const id = `t${++this.seq}`;
        const task = { id, title, status, output: "", createdAt: now, updatedAt: now };
        this.tasks.set(id, task);
        return task;
    }
    get(id) {
        return this.tasks.get(id);
    }
    list(status) {
        const all = [...this.tasks.values()].sort((a, b) => a.createdAt - b.createdAt);
        return status ? all.filter((t) => t.status === status) : all;
    }
    setStatus(id, status) {
        return this.patch(id, { status });
    }
    appendOutput(id, chunk) {
        const t = this.tasks.get(id);
        if (!t)
            return undefined;
        return this.patch(id, { output: t.output + chunk });
    }
    stop(id) {
        const t = this.tasks.get(id);
        if (!t || t.status === "done")
            return t;
        return this.patch(id, { status: "stopped" });
    }
    patch(id, fields) {
        const t = this.tasks.get(id);
        if (!t)
            return undefined;
        const next = { ...t, ...fields, id, updatedAt: this.clock() };
        this.tasks.set(id, next);
        return next;
    }
}
//# sourceMappingURL=task-registry.js.map