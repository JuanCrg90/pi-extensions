import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeDisplayText } from "../src/sanitize.ts";

test("sanitizeDisplayText strips ANSI color codes", () => {
  assert.equal(sanitizeDisplayText("\x1b[31mRed\x1b[0m text"), "Red text");
});

test("sanitizeDisplayText strips OSC 52 clipboard sequences", () => {
  assert.equal(
    sanitizeDisplayText("title\x1b]52;c;cGF5bG9hZA==\x07"),
    "title",
  );
});

test("sanitizeDisplayText strips OSC sequences with ST terminator", () => {
  assert.equal(
    sanitizeDisplayText("title\x1b]0;evil\x1b\\"),
    "title",
  );
});

test("sanitizeDisplayText strips control characters", () => {
  assert.equal(sanitizeDisplayText("te\x00st\x07"), "test");
});

test("sanitizeDisplayText keeps tabs and newlines", () => {
  assert.equal(sanitizeDisplayText("line1\nline2\ttab"), "line1\nline2\ttab");
});

test("sanitizeDisplayText trims whitespace", () => {
  assert.equal(sanitizeDisplayText("  text  "), "text");
});
