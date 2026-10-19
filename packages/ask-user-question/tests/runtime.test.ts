import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TUI, visibleWidth, type OverlayHandle } from "@earendil-works/pi-tui";
import askUserQuestion, {
  createDialogComponent,
  initQuestionState,
} from "../extensions/index.js";
import type {
  AskUserQuestionParams,
  DialogState,
  Question,
  AskUserQuestionResult,
} from "../extensions/types.js";

type ToolDef = {
  execute: (
    toolCallId: string,
    params: AskUserQuestionParams,
    signal: AbortSignal | undefined,
    onUpdate: ((update: { content: Array<{ type: string; text: string }>; details?: Record<string, unknown> }) => void) | undefined,
    ctx: any,
  ) => Promise<{ content: Array<{ type: string; text: string }>; details: Record<string, unknown>; terminate?: boolean }>;
};

function getTool(): ToolDef {
  let tool: ToolDef | undefined;
  askUserQuestion({
    registerTool(def: ToolDef) {
      tool = def;
    },
  } as any);
  assert.ok(tool);
  return tool;
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    question: "Pick one?",
    header: "Pick",
    options: [
      { id: "opt1", label: "React", description: "UI library" },
      { id: "opt2", label: "Vue", description: "Framework" },
    ],
    ...overrides,
  };
}

function makeParams(questions: Question[] = [makeQuestion()]): AskUserQuestionParams {
  return { questions };
}

function makeCtx(script?: (component: any) => void, mode: string = "tui") {
  const workingVisible: boolean[] = [];
  const updates: Array<{ content: Array<{ type: string; text: string }>; details?: Record<string, unknown> }> = [];

  const listeners = new Set<(data: string) => { consume?: boolean } | undefined>();
  const statuses = new Map<string, string>();
  const editorInput: string[] = [];
  const editor = { render: () => ["Agent response"], handleInput: (data: string) => editorInput.push(data) };
  const tui = new TUI({ columns: 80, rows: 24, hideCursor() {} } as any);
  tui.requestRender = () => {};
  tui.addChild(editor);
  tui.setFocus(editor);
  let component: any;
  let overlay: OverlayHandle;

  const ctx = {
    mode,
    hasUI: mode === "tui",
    ui: {
      setWorkingVisible(value: boolean) {
        workingVisible.push(value);
      },
      onTerminalInput(handler: (data: string) => { consume?: boolean } | undefined) {
        listeners.add(handler);
        return () => { listeners.delete(handler); };
      },
      setStatus(key: string, value: string | undefined) {
        if (value === undefined) statuses.delete(key);
        else statuses.set(key, value);
      },
      custom(factory: any, options?: { onHandle?: (handle: OverlayHandle) => void }) {
        let resolvePromise!: (value: AskUserQuestionResult | null) => void;
        const promise: Promise<AskUserQuestionResult | null> & { close?: () => void } = new Promise((resolve) => {
          resolvePromise = resolve;
        }) as Promise<AskUserQuestionResult | null> & { close?: () => void };

        component = factory(
          tui,
          { fg: (_color: string, text: string) => text, bold: (text: string) => text },
          {},
          (result: AskUserQuestionResult | null) => {
            overlay?.hide();
            component?.dispose();
            resolvePromise(result);
          },
        );
        overlay = tui.showOverlay(component);
        options?.onHandle?.(overlay);

        promise.close = () => resolvePromise(null);
        script?.(component);
        return promise;
      },
    },
  };

  return {
    ctx,
    workingVisible,
    updates,
    listeners,
    statuses,
    editorInput,
    tui,
    get component() { return component; },
    get overlay() { return overlay; },
    sendInput(data: string) {
      for (const listener of listeners) {
        if (listener(data)?.consume) return;
      }
      if (overlay.isFocused()) component.handleInput(data);
      else editor.handleInput(data);
    },
    onUpdate(update: { content: Array<{ type: string; text: string }>; details?: Record<string, unknown> }) {
      updates.push(update);
    },
  };
}

describe("runtime", () => {
  it("requires TUI mode", async () => {
    const tool = getTool();
    for (const mode of ["cli", "rpc"]) {
      const { ctx } = makeCtx(undefined, mode);
      const result = await tool.execute("id", makeParams(), undefined, undefined, ctx);
      assert.match(result.content[0]?.text ?? "", /interactive terminal/i);
      assert.deepStrictEqual(result.details, {});
    }
  });

  it("restores working indicator on single-select happy path", async () => {
    const tool = getTool();
    const env = makeCtx((component) => {
      component.handleInput("\n", undefined);
    });

    const result = await tool.execute("id", makeParams(), undefined, env.onUpdate, env.ctx);
    const details = result.details as AskUserQuestionResult;

    assert.deepStrictEqual(env.workingVisible, [false, true]);
    assert.strictEqual(details.cancelled, false);
    assert.strictEqual(details.answers?.q1?.kind, "single");
    assert.strictEqual((details.answers?.q1 as any)?.optionId, "opt1");
    assert.deepStrictEqual(
      env.updates.map((u) => u.details?.milestone),
      ["dialog_opened", "question_answered", "submitted"],
    );
  });

  it("dismisses via Esc then Esc", async () => {
    const tool = getTool();
    const env = makeCtx((component) => {
      component.handleInput("\x1b", undefined);
      component.handleInput("\x1b", undefined);
    });

    const result = await tool.execute("id", makeParams(), undefined, env.onUpdate, env.ctx);
    const details = result.details as AskUserQuestionResult;

    assert.strictEqual(details.cancelled, true);
    assert.strictEqual(result.terminate, true);
    assert.deepStrictEqual(env.workingVisible, [false, true]);
    assert.ok(env.updates.some((u) => u.details?.milestone === "dismissed"));
  });

  it("dismisses via Ctrl-C", async () => {
    const tool = getTool();
    const env = makeCtx((component) => {
      component.handleInput("\x03", undefined);
    });

    const result = await tool.execute("id", makeParams(), undefined, env.onUpdate, env.ctx);
    const details = result.details as AskUserQuestionResult;

    assert.strictEqual(details.cancelled, true);
    assert.strictEqual(result.terminate, true);
  });

  it("supports review flow for multi-question sessions", async () => {
    const tool = getTool();
    const q1 = makeQuestion({ id: "q1", header: "One", question: "First?" });
    const q2 = makeQuestion({ id: "q2", header: "Two", question: "Second?" });
    const env = makeCtx((component) => {
      component.handleInput("\n", undefined);
      component.handleInput("\n", undefined);
      component.handleInput("\n", undefined);
    });

    const result = await tool.execute("id", makeParams([q1, q2]), undefined, env.onUpdate, env.ctx);
    const details = result.details as AskUserQuestionResult;

    assert.strictEqual(details.cancelled, false);
    assert.ok(details.answers?.q1);
    assert.ok(details.answers?.q2);
    assert.ok(env.updates.some((u) => u.details?.milestone === "review_ready"));
    assert.ok(env.updates.some((u) => u.details?.milestone === "submitted"));
  });

  it("temporarily hides the modal without finishing and restores focus", async () => {
    const env = makeCtx();
    let settled = false;
    const pending = getTool().execute("id", makeParams(), undefined, env.onUpdate, env.ctx);
    void pending.then(() => { settled = true; });

    env.sendInput("\x1b[113;6u"); // Ctrl+Shift+Q, Kitty keyboard protocol
    await Promise.resolve();
    assert.strictEqual(settled, false);
    assert.strictEqual(env.overlay.isHidden(), true);
    assert.strictEqual(env.overlay.isFocused(), false);
    assert.match([...env.statuses.values()].join(""), /hidden.*Ctrl\+Shift\+Q/i);
    env.sendInput("\x1b[5~"); // PageUp remains available to the transcript/editor
    assert.deepStrictEqual(env.editorInput, ["\x1b[5~"]);
    assert.deepStrictEqual(env.workingVisible, [false]);
    assert.deepStrictEqual(env.updates.map((u) => u.details?.milestone), ["dialog_opened"]);

    env.sendInput("\x1b[113;6u");
    assert.strictEqual(env.overlay.isHidden(), false);
    assert.strictEqual(env.overlay.isFocused(), true);
    assert.strictEqual(env.statuses.size, 0);
    env.sendInput("\n");
    const result = await pending;
    assert.strictEqual((result.details as AskUserQuestionResult).cancelled, false);
    assert.strictEqual(env.listeners.size, 0);
    assert.strictEqual(env.statuses.size, 0);
  });

  for (const event of [
    { name: "release", data: "\x1b[113;6:3u" },
    { name: "repeat", data: "\x1b[113;6:2u" },
  ]) {
    it(`does not toggle again on a shortcut key ${event.name}`, async () => {
      const env = makeCtx();
      const pending = getTool().execute("id", makeParams(), undefined, env.onUpdate, env.ctx);
      env.sendInput("\x1b[113;6:1u"); // key down hides
      assert.strictEqual(env.overlay.isHidden(), true);
      env.sendInput(event.data);
      assert.strictEqual(env.overlay.isHidden(), true);
      assert.strictEqual(env.statuses.size, 1);

      env.sendInput("\x1b[113;6:1u"); // next key down restores
      assert.strictEqual(env.overlay.isFocused(), true);
      env.sendInput(event.data);
      assert.strictEqual(env.overlay.isHidden(), false);
      assert.strictEqual(env.overlay.isFocused(), true);
      assert.strictEqual(env.statuses.size, 0);
      assert.deepStrictEqual(env.editorInput, []);
      assert.deepStrictEqual(env.updates.map((u) => u.details?.milestone), ["dialog_opened"]);
      env.sendInput("\n");
      assert.strictEqual(((await pending).details as AskUserQuestionResult).cancelled, false);
      assert.strictEqual(env.listeners.size, 0);
    });
  }

  it("preserves Other drafts and cursor position across repeated hide cycles", async () => {
    const env = makeCtx();
    const pending = getTool().execute("id", makeParams(), undefined, undefined, env.ctx);
    env.sendInput("o");
    env.sendInput("abc");
    env.sendInput("\x1b[D");
    for (let i = 0; i < 2; i++) {
      env.sendInput("\x1b[113;6u");
      assert.strictEqual(env.overlay.isHidden(), true);
      env.sendInput("\x1b[113;6u");
      assert.strictEqual(env.overlay.isFocused(), true);
    }
    env.sendInput("X");
    env.sendInput("\n");
    const result = await pending;
    assert.strictEqual(((result.details as AskUserQuestionResult).answers?.q1 as any)?.text, "abXc");
    assert.deepStrictEqual(env.editorInput, []);
  });

  it("preserves selections, note drafts, and review mode when hidden", async () => {
    const env = makeCtx();
    const params = makeParams([makeQuestion({ multiSelect: true }), makeQuestion({ id: "q2" })]);
    const pending = getTool().execute("id", params, undefined, undefined, env.ctx);
    env.sendInput(" ");
    env.sendInput("N");
    env.sendInput("remember");
    env.sendInput("\x1b[113;6u");
    assert.strictEqual(env.overlay.isHidden(), true);
    env.sendInput("\x1b[113;6u");
    env.sendInput("\n"); // save note
    env.sendInput("\n"); // confirm first question
    env.sendInput("\n"); // answer second and enter review
    env.sendInput("\x1b[113;6u");
    assert.strictEqual(env.overlay.isHidden(), true);
    env.sendInput("\x1b[113;6u");
    assert.match(env.component.render(80).join("\n"), /Review Answers/);
    env.sendInput("\n");
    const details = (await pending).details as AskUserQuestionResult;
    assert.strictEqual(details.annotations?.q1?.questionNotes, "remember");
    assert.strictEqual((details.answers?.q1 as any)?.selections[0]?.optionId, "opt1");
    assert.strictEqual(env.listeners.size, 0);
  });

  it("does not take the shortcut from another focused overlay", async () => {
    const env = makeCtx();
    const pending = getTool().execute("id", makeParams(), undefined, undefined, env.ctx);
    const other = env.tui.showOverlay({ render: () => ["Other dialog"] });
    env.sendInput("\x1b[113;6u");
    assert.strictEqual(env.overlay.isHidden(), false);
    other.hide();
    env.sendInput("\x1b[113;6u");
    const otherWhileHidden = env.tui.showOverlay({ render: () => ["Other dialog"] });
    env.sendInput("\x1b[113;6u");
    assert.strictEqual(env.overlay.isHidden(), true);
    otherWhileHidden.hide();
    env.sendInput("\x1b[113;6u");
    env.sendInput("\x03");
    await pending;
    assert.strictEqual(env.listeners.size, 0);
  });

  it("cleans up the hidden modal and reminder on abort", async () => {
    const env = makeCtx();
    const controller = new AbortController();
    const pending = getTool().execute("id", makeParams(), controller.signal, undefined, env.ctx);
    env.sendInput("\x1b[113;6u");
    assert.strictEqual(env.overlay.isHidden(), true);
    controller.abort();
    const result = await pending;
    assert.strictEqual(result.terminate, true);
    assert.strictEqual((result.details as AskUserQuestionResult).cancelled, true);
    assert.strictEqual(env.tui.hasOverlay(), false);
    assert.strictEqual(env.listeners.size, 0);
    assert.strictEqual(env.statuses.size, 0);
    assert.deepStrictEqual(env.workingVisible, [false, true]);
    env.sendInput("\x1b[113;6u");
    assert.deepStrictEqual(env.editorInput, ["\x1b[113;6u"]);
  });

  it("closes cleanly on AbortSignal", async () => {
    const tool = getTool();
    const controller = new AbortController();
    const env = makeCtx();

    const resultPromise = tool.execute("id", makeParams(), controller.signal, env.onUpdate, env.ctx);
    controller.abort();
    const result = await resultPromise;
    const details = result.details as AskUserQuestionResult;

    assert.strictEqual(details.cancelled, true);
    assert.strictEqual(result.terminate, true);
    assert.deepStrictEqual(env.workingVisible, [false, true]);
    assert.ok(env.updates.some((u) => u.details?.reason === "signal_abort"));
  });
});

describe("dialog component regressions", () => {
  function makeDialogState(): DialogState {
    const q1 = makeQuestion({ id: "q1" });
    const q2 = makeQuestion({ id: "q2", header: "Q2", question: "Second?" });
    return {
      questions: [q1, q2],
      questionStates: new Map([
        [q1.id, initQuestionState(q1)],
        [q2.id, initQuestionState(q2)],
      ]),
      currentIndex: 0,
      pendingEscape: false,
      showHelp: false,
      statusMessage: "",
      inReviewMode: false,
      reviewPickerIndex: 0,
    };
  }

  it("Tab advances to the next question", () => {
    const state = makeDialogState();
    const component = createDialogComponent(state, () => {}, () => {});
    component.handleInput("\t", undefined);
    assert.strictEqual(state.currentIndex, 1);
  });

  it("Space on multi-select Other... opens custom input instead of crashing", () => {
    const q = makeQuestion({ multiSelect: true });
    const state: DialogState = {
      questions: [q],
      questionStates: new Map([[q.id, initQuestionState(q)]]),
      currentIndex: 0,
      pendingEscape: false,
      showHelp: false,
      statusMessage: "",
      inReviewMode: false,
      reviewPickerIndex: 0,
    };
    const qState = state.questionStates.get(q.id)!;
    qState.focusIndex = q.options.length;

    const events: string[] = [];
    const component = createDialogComponent(state, () => {}, (ev) => events.push(ev.type));
    component.handleInput(" ");

    assert.strictEqual(qState.otherInputMode, true);
    assert.ok(events.includes("other_input"));
  });

  it("handles real arrow escape sequences", () => {
    const state = makeDialogState();
    const component = createDialogComponent(state, () => {}, () => {});
    component.handleInput("\x1b[B");
    assert.strictEqual(state.questionStates.get("q1")!.focusIndex, 1);
  });

  it("routes hotkey letters and spaces into Other input", () => {
    const state = makeDialogState();
    const qState = state.questionStates.get("q1")!;
    const component = createDialogComponent(state, () => {}, () => {});
    component.handleInput("o");
    for (const char of "join ? now") component.handleInput(char);
    assert.strictEqual(qState.otherDraft, "join ? now");
    assert.strictEqual(qState.noteInputMode, false);
  });

  it("uses Pi Input cursor editing for Other answers", () => {
    const state = makeDialogState();
    const qState = state.questionStates.get("q1")!;
    const component = createDialogComponent(state, () => {}, () => {});
    component.handleInput("o");
    component.handleInput("abc");
    component.handleInput("\x1b[D");
    component.handleInput("X");
    assert.strictEqual(qState.otherDraft, "abXc");
  });

  it("discards Other edits on Escape", () => {
    const state = makeDialogState();
    const qState = state.questionStates.get("q1")!;
    qState.otherText = "saved";
    const component = createDialogComponent(state, () => {}, () => {});
    component.handleInput("o");
    component.handleInput("x");
    component.handleInput("\x1b");
    assert.strictEqual(qState.otherText, "saved");
    assert.strictEqual(qState.otherDraft, "saved");
  });

  it("marks multi-select answered on Space and clears on deselect", () => {
    const q = makeQuestion({ multiSelect: true });
    const state = makeDialogState();
    state.questions = [q];
    state.questionStates = new Map([[q.id, initQuestionState(q)]]);
    const component = createDialogComponent(state, () => {}, () => {});
    const qState = state.questionStates.get(q.id)!;
    component.handleInput(" ");
    assert.strictEqual(qState.answered, true);
    component.handleInput(" ");
    assert.strictEqual(qState.answered, false);
  });

  it("enters review after required questions while optional remain unanswered", () => {
    const state = makeDialogState();
    state.questions[1].required = false;
    const component = createDialogComponent(state, () => {}, () => {});
    component.handleInput("\r");
    assert.strictEqual(state.inReviewMode, true);
    assert.strictEqual(state.questionStates.get("q2")!.answered, false);
  });

  it("applies Pi theme colors to dialog semantics", () => {
    const state = makeDialogState();
    const theme = {
      fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
      bold: (text: string) => `<bold>${text}</bold>`,
    };
    const component = createDialogComponent(state, () => {}, () => {}, theme as any);
    const output = component.render(80).join("\n");
    assert.match(output, /<accent><bold>❯ Pick:/);
    assert.match(output, /<dim>.*Enter: confirm/);
  });

  it("renders the dialog inside official Pi borders", () => {
    const state = makeDialogState();
    const component = createDialogComponent(state, () => {}, () => {});
    const lines = component.render(40);
    assert.match(lines[0], /^─+$/);
    assert.match(lines.at(-1) ?? "", /^─+$/);
  });

  it("never renders lines wider than the terminal", () => {
    const state = makeDialogState();
    state.questions[0].options[0].description = "A very long description that must wrap safely";
    const component = createDialogComponent(state, () => {}, () => {});
    assert.ok(component.render(20).every((line) => visibleWidth(line) <= 20));
  });
});
