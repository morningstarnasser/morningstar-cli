import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".morningstar");
const TODO_FILE = join(CONFIG_DIR, "todo.json");

export interface TodoItem {
  id: number;
  text: string;
  done: boolean;
  priority: "low" | "normal" | "high";
  createdAt: string;
  doneAt?: string;
}

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export function loadTodos(): TodoItem[] {
  try {
    if (existsSync(TODO_FILE)) {
      return JSON.parse(readFileSync(TODO_FILE, "utf-8"));
    }
  } catch {}
  return [];
}

function saveTodos(todos: TodoItem[]): void {
  ensureDir();
  writeFileSync(TODO_FILE, JSON.stringify(todos, null, 2), "utf-8");
}

export function addTodo(text: string, priority: "low" | "normal" | "high" = "normal"): TodoItem {
  const todos = loadTodos();
  const id = todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1;
  const item: TodoItem = {
    id,
    text,
    done: false,
    priority,
    createdAt: new Date().toISOString(),
  };
  todos.push(item);
  saveTodos(todos);
  return item;
}

export function toggleTodo(id: number): TodoItem | null {
  const todos = loadTodos();
  const item = todos.find(t => t.id === id);
  if (!item) return null;
  item.done = !item.done;
  item.doneAt = item.done ? new Date().toISOString() : undefined;
  saveTodos(todos);
  return item;
}

export function removeTodo(id: number): boolean {
  const todos = loadTodos();
  const idx = todos.findIndex(t => t.id === id);
  if (idx === -1) return false;
  todos.splice(idx, 1);
  saveTodos(todos);
  return true;
}

export function clearDoneTodos(): number {
  const todos = loadTodos();
  const before = todos.length;
  const remaining = todos.filter(t => !t.done);
  saveTodos(remaining);
  return before - remaining.length;
}

export function clearAllTodos(): number {
  const todos = loadTodos();
  const count = todos.length;
  saveTodos([]);
  return count;
}

export function getTodoStats(): { total: number; done: number; open: number; high: number } {
  const todos = loadTodos();
  return {
    total: todos.length,
    done: todos.filter(t => t.done).length,
    open: todos.filter(t => !t.done).length,
    high: todos.filter(t => !t.done && t.priority === "high").length,
  };
}
