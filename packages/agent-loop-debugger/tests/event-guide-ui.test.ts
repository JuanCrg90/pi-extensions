import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

it("closes the guide on Escape even when a search field consumes the native dialog shortcut", () => {
  const listeners = new Map<string, (event: unknown) => void>();
  let closed = false;
  let prevented = false;
  const dialog = {
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    close: () => { closed = true; },
  };
  const otherElement = { addEventListener: () => {} };
  const context = {
    document: { getElementById: (id: string) => id === "event-guide" ? dialog : otherElement },
  };
  const script = readFileSync(new URL("../public/event-guide.js", import.meta.url), "utf-8");
  runInNewContext(`${script}\ninitializeEventGuide({ closeStatePanel() {} });`, context);

  listeners.get("keydown")?.({ key: "Enter", preventDefault: () => { prevented = true; } });
  assert.equal(closed, false);
  listeners.get("keydown")?.({ key: "Escape", preventDefault: () => { prevented = true; } });
  assert.equal(closed, true);
  assert.equal(prevented, true);
});
