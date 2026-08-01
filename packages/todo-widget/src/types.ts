export type TaskState = "not-started" | "in-progress" | "done";

export interface Task {
  id: string;
  title: string;
  state: TaskState;
}

export interface TaskGroup {
  id: string;
  title: string;
  tasks: Task[];
}

export interface ParsedTodoList {
  projectTitle: string;
  groups: TaskGroup[];
}

export interface PersistedTaskState {
  state: TaskState;
}

export interface PersistedState {
  projectTitle?: string;
  tasks?: Record<string, PersistedTaskState>;
  collapsedGroups?: string[];
}

export interface WidgetState {
  projectTitle: string;
  groups: TaskGroup[];
  collapsedGroups: Set<string>;
}
