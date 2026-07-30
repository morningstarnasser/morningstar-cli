// ─── TaskRegistry-light (#6, from claw-code lane 4) ──────────────────────────
// In-memory task lifecycle: create / get / list / update / append output / stop.
// Lets Carry track long-running or backgrounded work as first-class records.
// Pure data structure (no subprocess execution) — fully testable.

export type TaskStatus = "pending" | "running" | "done" | "stopped" | "error";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  output: string;
  createdAt: number;
  updatedAt: number;
}

export class TaskRegistry {
  private tasks = new Map<string, Task>();
  private seq = 0;

  constructor(private clock: () => number = Date.now) {}

  create(title: string, status: TaskStatus = "pending"): Task {
    const now = this.clock();
    const id = `t${++this.seq}`;
    const task: Task = { id, title, status, output: "", createdAt: now, updatedAt: now };
    this.tasks.set(id, task);
    return task;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  list(status?: TaskStatus): Task[] {
    const all = [...this.tasks.values()].sort((a, b) => a.createdAt - b.createdAt);
    return status ? all.filter((t) => t.status === status) : all;
  }

  setStatus(id: string, status: TaskStatus): Task | undefined {
    return this.patch(id, { status });
  }

  appendOutput(id: string, chunk: string): Task | undefined {
    const t = this.tasks.get(id);
    if (!t) return undefined;
    return this.patch(id, { output: t.output + chunk });
  }

  stop(id: string): Task | undefined {
    const t = this.tasks.get(id);
    if (!t || t.status === "done") return t;
    return this.patch(id, { status: "stopped" });
  }

  private patch(id: string, fields: Partial<Task>): Task | undefined {
    const t = this.tasks.get(id);
    if (!t) return undefined;
    const next: Task = { ...t, ...fields, id, updatedAt: this.clock() };
    this.tasks.set(id, next);
    return next;
  }
}
