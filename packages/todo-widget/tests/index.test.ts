import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import todoWidget from "../src/index.ts";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "todo-widget-"));
}

function createMockApi(): {
  api: ExtensionAPI;
  tools: Record<string, (...args: unknown[]) => unknown>;
  shortcuts: Record<string, (...args: unknown[]) => unknown>;
  commands: Record<string, (...args: unknown[]) => unknown>;
  events: Record<string, (...args: unknown[]) => unknown>;
  widgets: string[];
  notify: string[];
} {
  const tools: Record<string, (...args: unknown[]) => unknown> = {};
  const shortcuts: Record<string, (...args: unknown[]) => unknown> = {};
  const commands: Record<string, (...args: unknown[]) => unknown> = {};
  const events: Record<string, (...args: unknown[]) => unknown> = {};
  const widgets: string[] = [];
  const notify: string[] = [];

  const api = {
    registerTool: (opts: { name: string; execute: (...args: unknown[]) => unknown }) => {
      tools[opts.name] = opts.execute;
    },
    registerShortcut: (key: string, opts: { handler: (...args: unknown[]) => unknown }) => {
      shortcuts[key] = opts.handler;
    },
    registerCommand: (name: string, opts: { handler: (...args: unknown[]) => unknown }) => {
      commands[name] = opts.handler;
    },
    on: (event: string, handler: (...args: unknown[]) => unknown) => {
      events[event] = handler;
    },
  } as unknown as ExtensionAPI;

  return { api, tools, shortcuts, commands, events, widgets, notify };
}

function createMockCtx(
  projectPath: string,
  widgets: string[],
  notify: string[],
): ExtensionContext {
  return {
    mode: "tui",
    hasUI: true,
    ui: {
      setWidget: (_key: string, value: unknown) => {
        widgets.push(typeof value === "function" ? "component" : "empty");
      },
      notify: (message: string) => {
        notify.push(message);
      },
    },
    cwd: () => projectPath,
  } as unknown as ExtensionContext;
}

const originalCwd = process.cwd;

async function withCwd(dir: string, fn: () => Promise<void>): Promise<void> {
  process.cwd = () => dir;
  try {
    await fn();
  } finally {
    process.cwd = originalCwd;
  }
}

const sampleMarkdown = (group: string): string => `# Project

## ${group}

- [ ] One
- [ ] Two
`;

test("LoadTodoList parses markdown and sets widget", async () => {
  const dir = tempDir();
  try {
    await withCwd(dir, async () => {
      const mock = createMockApi();
      todoWidget(mock.api);

      const ctx = createMockCtx(dir, mock.widgets, mock.notify);
      const result = (await mock.tools.LoadTodoList(
        "call-1",
        { markdown: sampleMarkdown("Group A") },
        undefined,
        undefined,
        ctx,
      )) as { content: { text: string }[] };

      assert.equal(result.content[0].text, "Loaded todo list: Project (1 groups, 2 tasks).");
      assert.equal(mock.widgets.length, 1);
      assert.equal(mock.widgets[0], "component");

      const stateFile = join(dir, ".pi", "todo-widget-state.json");
      assert.ok(existsSync(stateFile));
      const persisted = JSON.parse(readFileSync(stateFile, "utf-8"));
      assert.deepEqual(persisted.collapsedGroups, []);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("LoadTodoList returns task IDs in details", async () => {
  const dir = tempDir();
  try {
    await withCwd(dir, async () => {
      const mock = createMockApi();
      todoWidget(mock.api);

      const ctx = createMockCtx(dir, mock.widgets, mock.notify);
      const result = (await mock.tools.LoadTodoList(
        "call-1",
        { markdown: sampleMarkdown("Group A") },
        undefined,
        undefined,
        ctx,
      )) as { details: { tasks: { id: string; title: string; state: string }[] } };

      assert.ok(result.details.tasks);
      assert.equal(result.details.tasks.length, 2);
      assert.equal(result.details.tasks[0].id, "group-a:one");
      assert.equal(result.details.tasks[0].title, "One");
      assert.equal(result.details.tasks[0].state, "not-started");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("UpdateTodoTask returns error for unknown task ID", async () => {
  const dir = tempDir();
  try {
    await withCwd(dir, async () => {
      const mock = createMockApi();
      todoWidget(mock.api);

      const ctx = createMockCtx(dir, mock.widgets, mock.notify);
      await mock.tools.LoadTodoList(
        "call-1",
        { markdown: sampleMarkdown("Group A") },
        undefined,
        undefined,
        ctx,
      );

      const result = (await mock.tools.UpdateTodoTask(
        "call-2",
        { taskId: "group-a:nonexistent", state: "done" },
        undefined,
        undefined,
        ctx,
      )) as { content: { text: string }[]; details: { error: string } };

      assert.equal(result.details.error, "task_not_found");
      assert.ok(result.content[0].text.includes("not found"));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ListTodoTasks returns current tasks with IDs", async () => {
  const dir = tempDir();
  try {
    await withCwd(dir, async () => {
      const mock = createMockApi();
      todoWidget(mock.api);

      const ctx = createMockCtx(dir, mock.widgets, mock.notify);
      await mock.tools.LoadTodoList(
        "call-1",
        { markdown: sampleMarkdown("Group A") },
        undefined,
        undefined,
        ctx,
      );

      const result = (await mock.tools.ListTodoTasks(
        "call-2",
        {},
        undefined,
        undefined,
        ctx,
      )) as { details: { tasks: { id: string; title: string }[] } };

      assert.equal(result.details.tasks.length, 2);
      assert.equal(result.details.tasks[0].id, "group-a:one");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ListTodoTasks fails when no list is loaded", async () => {
  const dir = tempDir();
  try {
    await withCwd(dir, async () => {
      const mock = createMockApi();
      todoWidget(mock.api);

      const ctx = createMockCtx(dir, mock.widgets, mock.notify);
      const result = (await mock.tools.ListTodoTasks(
        "call-1",
        {},
        undefined,
        undefined,
        ctx,
      )) as { details: { error: string } };

      assert.equal(result.details.error, "no_list_loaded");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("UpdateTodoTask updates state and refreshes widget", async () => {
  const dir = tempDir();
  try {
    await withCwd(dir, async () => {
      const mock = createMockApi();
      todoWidget(mock.api);

      const ctx = createMockCtx(dir, mock.widgets, mock.notify);
      await mock.tools.LoadTodoList(
        "call-1",
        { markdown: sampleMarkdown("Group A") },
        undefined,
        undefined,
        ctx,
      );

      const result = (await mock.tools.UpdateTodoTask(
        "call-2",
        { taskId: "group-a:one", state: "done" },
        undefined,
        undefined,
        ctx,
      )) as { content: { text: string }[] };

      assert.equal(result.content[0].text, "Updated task group-a:one to done.");
      assert.equal(mock.widgets.length, 2);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("UpdateTodoTask fails when no list is loaded", async () => {
  const dir = tempDir();
  try {
    await withCwd(dir, async () => {
      const mock = createMockApi();
      todoWidget(mock.api);

      const ctx = createMockCtx(dir, mock.widgets, mock.notify);
      const result = (await mock.tools.UpdateTodoTask(
        "call-1",
        { taskId: "group-a:one", state: "done" },
        undefined,
        undefined,
        ctx,
      )) as { content: { text: string }[]; details: { error: string } };

      assert.equal(result.content[0].text, "No todo list is loaded. Call LoadTodoList first.");
      assert.equal(result.details.error, "no_list_loaded");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ClearTodoList clears state and widget when confirmed", async () => {
  const dir = tempDir();
  try {
    await withCwd(dir, async () => {
      const mock = createMockApi();
      todoWidget(mock.api);

      const ctx = createMockCtx(dir, mock.widgets, mock.notify);
      await mock.tools.LoadTodoList(
        "call-1",
        { markdown: sampleMarkdown("Group A") },
        undefined,
        undefined,
        ctx,
      );

      const result = (await mock.tools.ClearTodoList(
        "call-2",
        { confirm: true },
        undefined,
        undefined,
        ctx,
      )) as { content: { text: string }[] };

      assert.equal(result.content[0].text, "Todo list cleared and state deleted.");
      assert.ok(!existsSync(join(dir, ".pi", "todo-widget-state.json")));
      assert.equal(mock.widgets[mock.widgets.length - 1], "empty");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ClearTodoList does not clear without confirmation", async () => {
  const dir = tempDir();
  try {
    await withCwd(dir, async () => {
      const mock = createMockApi();
      todoWidget(mock.api);

      const ctx = createMockCtx(dir, mock.widgets, mock.notify);
      await mock.tools.LoadTodoList(
        "call-1",
        { markdown: sampleMarkdown("Group A") },
        undefined,
        undefined,
        ctx,
      );

      const result = (await mock.tools.ClearTodoList(
        "call-2",
        { confirm: false },
        undefined,
        undefined,
        ctx,
      )) as { content: { text: string }[]; details: { cleared: boolean } };

      assert.equal(result.content[0].text, "ClearTodoList was not confirmed. Pass confirm: true to clear.");
      assert.equal(result.details.cleared, false);
      assert.ok(existsSync(join(dir, ".pi", "todo-widget-state.json")));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Group navigation shortcuts cycle focus and toggle collapse", async () => {
  const dir = tempDir();
  try {
    await withCwd(dir, async () => {
      const mock = createMockApi();
      todoWidget(mock.api);

      const ctx = createMockCtx(dir, mock.widgets, mock.notify);
      await mock.tools.LoadTodoList(
        "call-1",
        {
          markdown: `# Project

## Group A

- [ ] One

## Group B

- [ ] Two
`,
        },
        undefined,
        undefined,
        ctx,
      );

      const initialWidgets = mock.widgets.length;
      await mock.shortcuts["ctrl+shift+["](ctx);
      assert.equal(mock.widgets.length, initialWidgets + 1);

      await mock.shortcuts["ctrl+shift+return"](ctx);
      const persisted = JSON.parse(readFileSync(join(dir, ".pi", "todo-widget-state.json"), "utf-8"));
      assert.ok(persisted.collapsedGroups.includes("group-b"));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Toggle shortcut flips widget visibility", async () => {
  const dir = tempDir();
  try {
    await withCwd(dir, async () => {
      const mock = createMockApi();
      todoWidget(mock.api);

      const ctx = createMockCtx(dir, mock.widgets, mock.notify);
      await mock.tools.LoadTodoList(
        "call-1",
        { markdown: sampleMarkdown("Group A") },
        undefined,
        undefined,
        ctx,
      );

      await mock.shortcuts["ctrl+shift+l"](ctx);
      assert.equal(mock.widgets[mock.widgets.length - 1], "empty");
      assert.equal(mock.notify[0], "Todo widget off");

      await mock.shortcuts["ctrl+shift+l"](ctx);
      assert.equal(mock.widgets[mock.widgets.length - 1], "component");
      assert.equal(mock.notify[1], "Todo widget on");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
