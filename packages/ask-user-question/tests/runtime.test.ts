import { describe, it } from "node:test";
import assert from "node:assert/strict";
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

  const ctx = {
    mode,
    hasUI: mode === "tui",
    ui: {
      setWorkingVisible(value: boolean) {
        workingVisible.push(value);
      },
      custom(factory: any) {
        let resolvePromise!: (value: AskUserQuestionResult | null) => void;
        const promise: Promise<AskUserQuestionResult | null> & { close?: () => void } = new Promise((resolve) => {
          resolvePromise = resolve;
        }) as Promise<AskUserQuestionResult | null> & { close?: () => void };

        const component = factory(
          { requestRender() {} },
          {},
          {},
          (result: AskUserQuestionResult | null) => resolvePromise(result),
        );

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
    onUpdate(update: { content: Array<{ type: string; text: string }>; details?: Record<string, unknown> }) {
      updates.push(update);
    },
  };
}

describe("runtime", () => {
  it("requires interactive terminal", async () => {
    const tool = getTool();
    const { ctx } = makeCtx(undefined, "cli");
    const result = await tool.execute("id", makeParams(), undefined, undefined, ctx);
    assert.match(result.content[0]?.text ?? "", /interactive terminal/i);
    assert.deepStrictEqual(result.details, {});
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
    component.handleInput(" ", undefined);

    assert.strictEqual(qState.otherInputMode, true);
    assert.ok(events.includes("other_input"));
  });
});
