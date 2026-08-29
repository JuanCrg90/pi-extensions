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

export interface PersistedTask {
  id: string;
  title: string;
  state: TaskState;
}

export interface PersistedGroup {
  id: string;
  title: string;
  tasks: PersistedTask[];
}

export interface PersistedTaskState {
  state: TaskState;
}

export interface PersistedState {
  projectTitle?: string;
  groups?: PersistedGroup[];
  tasks?: Record<string, PersistedTaskState>;
  collapsedGroups?: string[];
}

export interface WidgetState {
  projectTitle: string;
  groups: TaskGroup[];
  collapsedGroups: Set<string>;
}
