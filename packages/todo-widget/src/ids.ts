import type { ParsedTodoList, TaskGroup, Task } from "./types.js";

const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
};

const groupId = (groupTitle: string): string => {
  return `task-${slugify(groupTitle)}`;
};

const itemId = (itemTitle: string): string => {
  return slugify(itemTitle);
};

export function withIds(parsed: ParsedTodoList): ParsedTodoList {
  const seenGroupIds = new Map<string, number>();
  const seenItemIds = new Map<string, number>();

  const groups: TaskGroup[] = [];

  for (const srcGroup of parsed.groups) {
    const baseGroupId = groupId(srcGroup.title);
    const groupCount = seenGroupIds.get(baseGroupId) ?? 0;
    const gid = groupCount === 0 ? baseGroupId : `${baseGroupId}-${groupCount + 1}`;
    seenGroupIds.set(baseGroupId, groupCount + 1);

    const tasks: Task[] = [];
    for (const srcTask of srcGroup.tasks) {
      const baseItemId = itemId(srcTask.title);
      const itemKey = `${gid}:${baseItemId}`;
      const itemCount = seenItemIds.get(itemKey) ?? 0;
      const tid = itemCount === 0 ? baseItemId : `${baseItemId}-${itemCount + 1}`;
      seenItemIds.set(itemKey, itemCount + 1);

      tasks.push({
        id: `${gid}:${tid}`,
        title: srcTask.title,
        state: srcTask.state,
      });
    }

    groups.push({ id: gid, title: srcGroup.title, tasks });
  }

  return { projectTitle: parsed.projectTitle, groups };
}

export function makeId(groupTitle: string, itemTitle: string): string {
  return `${groupId(groupTitle)}:${itemId(itemTitle)}`;
}

export function getGroupId(groupTitle: string): string {
  return groupId(groupTitle);
}
