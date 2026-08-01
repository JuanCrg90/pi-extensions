import { test } from "node:test";
import assert from "node:assert/strict";
import { withIds, makeId, getGroupId } from "../src/ids.ts";
import { parseTodoList } from "../src/parser.ts";

test("withIds assigns stable group and task IDs", () => {
  const parsed = parseTodoList(`# Project

## Task 1: Setup

- [ ] Confirmar
- [x] Ejecutar

## Task 2: Verify

- [/] In progress
`);

  const result = withIds(parsed);

  assert.equal(result.groups[0].id, "task-1-setup");
  assert.equal(result.groups[0].tasks[0].id, "task-1-setup:confirmar");
  assert.equal(result.groups[0].tasks[1].id, "task-1-setup:ejecutar");
  assert.equal(result.groups[1].id, "task-2-verify");
  assert.equal(result.groups[1].tasks[0].id, "task-2-verify:in-progress");
});

test("withIds deduplicates identical group titles", () => {
  const parsed = parseTodoList(`# P

## Group

- [ ] One

## Group

- [ ] Two
`);

  const result = withIds(parsed);
  assert.equal(result.groups[0].id, "group");
  assert.equal(result.groups[1].id, "group-2");
});

test("withIds deduplicates identical task titles within a group", () => {
  const parsed = parseTodoList(`# P

## Group

- [ ] Same
- [ ] Same
- [ ] Same
`);

  const result = withIds(parsed);
  assert.equal(result.groups[0].tasks[0].id, "group:same");
  assert.equal(result.groups[0].tasks[1].id, "group:same-2");
  assert.equal(result.groups[0].tasks[2].id, "group:same-3");
});

test("withIds ignores duplicate task titles across different groups", () => {
  const parsed = parseTodoList(`# P

## Group A

- [ ] Same

## Group B

- [ ] Same
`);

  const result = withIds(parsed);
  assert.equal(result.groups[0].tasks[0].id, "group-a:same");
  assert.equal(result.groups[1].tasks[0].id, "group-b:same");
});

test("makeId returns deterministic ID", () => {
  assert.equal(makeId("Task 1: Setup", "Confirmar"), "task-1-setup:confirmar");
});

test("getGroupId returns deterministic group ID", () => {
  assert.equal(getGroupId("Task 1: Setup"), "task-1-setup");
});
