import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTodoList } from "../src/parser.ts";

test("parseTodoList extracts project title and groups", () => {
  const md = `# Project: Turnstile

## Task 1: Setup

- [ ] First
- [x] Second

## Task 2: Verify

- [/] In progress
`;

  const result = parseTodoList(md);

  assert.equal(result.projectTitle, "Project: Turnstile");
  assert.equal(result.groups.length, 2);
  assert.equal(result.groups[0].title, "Task 1: Setup");
  assert.equal(result.groups[0].tasks.length, 2);
  assert.equal(result.groups[0].tasks[0].title, "First");
  assert.equal(result.groups[0].tasks[0].state, "not-started");
  assert.equal(result.groups[0].tasks[1].title, "Second");
  assert.equal(result.groups[0].tasks[1].state, "done");
  assert.equal(result.groups[1].title, "Task 2: Verify");
  assert.equal(result.groups[1].tasks[0].title, "In progress");
  assert.equal(result.groups[1].tasks[0].state, "in-progress");
});

test("parseTodoList ignores items before the first group", () => {
  const md = `# Title

Some intro text.

- [ ] orphan item

## Group

- [x] Real
`;

  const result = parseTodoList(md);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].tasks.length, 1);
  assert.equal(result.groups[0].tasks[0].title, "Real");
});

test("parseTodoList defaults project title when no h1", () => {
  const md = `## Group

- [ ] One
`;

  const result = parseTodoList(md);
  assert.equal(result.projectTitle, "Tasks");
  assert.equal(result.groups.length, 1);
});

test("parseTodoList handles CRLF line endings", () => {
  const md = "# Title\r\n\r\n## Group\r\n\r\n- [x] Task\r\n";
  const result = parseTodoList(md);
  assert.equal(result.projectTitle, "Title");
  assert.equal(result.groups[0].tasks[0].state, "done");
});

test("parseTodoList keeps markdown inline but does not parse nested blocks", () => {
  const md = `## Group

- [ ] Item with **bold** text
- [x] Another
`;

  const result = parseTodoList(md);
  assert.equal(result.groups[0].tasks[0].title, "Item with **bold** text");
});

test("parseTodoList uses first h1 as project title", () => {
  const md = `# First Title

## Group

- [ ] One

# Second Title

## Group 2

- [ ] Two
`;

  const result = parseTodoList(md);
  assert.equal(result.projectTitle, "First Title");
  assert.equal(result.groups.length, 2);
});

test("parseTodoList strips ANSI and OSC sequences from titles", () => {
  const md = `# \x1b[31mInjected\x1b[0m Title\x1b]52;c;ZXZpbA==\x07

## \x1b]0;evil\x1b\\ Group

- [ ] \x1b[31mRed\x1b[0m Task
`;

  const result = parseTodoList(md);
  assert.equal(result.projectTitle, "Injected Title");
  assert.equal(result.groups[0].title, "Group");
  assert.equal(result.groups[0].tasks[0].title, "Red Task");
});

test("parseTodoList throws when no groups exist", () => {
  const md = `# Title

- [ ] Orphan
`;
  assert.throws(() => parseTodoList(md), /No task groups found/);
});

test("parseTodoList throws when groups have no tasks", () => {
  const md = `# Title

## Group A

## Group B
`;
  assert.throws(() => parseTodoList(md), /No tasks found/);
});

test("LoadTodoList returns parse error for invalid markdown", async () => {
  // Covered by parser tests; tool test is in index.test.ts
});
