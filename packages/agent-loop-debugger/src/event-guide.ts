/** Educational reference for the events this debugger actually collects.
 * Semantics follow Pi's extension lifecycle docs and exported event types.
 * Categories intentionally match the timeline, not all of Pi's event groups.
 */
import type { EventCategory } from "./events.ts";

export interface EventGuideEntry {
  type: string;
  category: EventCategory;
  description: string;
  inspect: string;
}

export const eventGuide: readonly EventGuideEntry[] = [
  {
    type: "session_start", category: "session",
    description: "A session runtime has started or been loaded, including after a reload or session switch.",
    inspect: "reason explains why it started; previousSessionFile may identify the session it replaced.",
  },
  {
    type: "session_shutdown", category: "session",
    description: "The current session runtime is about to be torn down. This can mean quitting, reloading, or replacing the session, not just exiting Pi.",
    inspect: "reason identifies the shutdown cause; targetSessionFile may identify the destination session.",
  },
  {
    type: "before_agent_start", category: "agent",
    description: "A prompt is being prepared before the agent loop begins. Extensions can add context or change the system prompt at this stage.",
    inspect: "prompt, images, systemPrompt, and systemPromptOptions show the input and prompt configuration observed by this debugger.",
  },
  {
    type: "agent_start", category: "agent",
    description: "A low-level agent loop has begun. It can contain several model turns when tools are needed.",
    inspect: "This is a lifecycle marker; follow turn_start and the message events to see the work.",
  },
  {
    type: "agent_end", category: "agent",
    description: "One low-level agent loop has ended. Automatic retries, compaction recovery, or queued follow-ups can still start more work; this is not the final idle signal.",
    inspect: "messages contains the messages produced by this loop. Look for agent_settled to know automatic processing has stopped.",
  },
  {
    type: "agent_settled", category: "agent",
    description: "The run has fully settled: no automatic retry, compaction retry, or queued continuation remains. A new prompt or extension can still start another run.",
    inspect: "This is a lifecycle marker with no message body; compare it with agent_end when studying retries or follow-ups.",
  },
  {
    type: "turn_start", category: "agent",
    description: "A model turn is beginning: one model response and any tool calls it requests. A single user prompt may require multiple turns.",
    inspect: "turnIndex identifies the turn within the loop; timestamp records its start.",
  },
  {
    type: "turn_end", category: "agent",
    description: "The model response and its tool calls have finished for this turn. Another turn may follow so the model can use the tool results.",
    inspect: "turnIndex, message, and toolResults show the response and the results collected for this turn.",
  },
  {
    type: "message_start", category: "agent",
    description: "A message is entering the conversation. This can be a user, assistant, or tool-result message, not just the start of a model response.",
    inspect: "message.role tells you who the message belongs to. A toolResult message can appear after the tool execution events.",
  },
  {
    type: "message_end", category: "agent",
    description: "A message has finished. An assistant message can contain tool calls, so its end does not mean the turn or agent run is over.",
    inspect: "message.role and message.content distinguish assistant output from user input and tool results; assistant stopReason can explain why generation stopped.",
  },
  {
    type: "model_select", category: "agent",
    description: "The selected model changed through explicit selection, cycling, or session restoration. The debugger groups this under agent events.",
    inspect: "model, previousModel, and source identify the new model and how it was selected.",
  },
  {
    type: "context", category: "prompt",
    description: "Conversation messages are being assembled before a model call. Extensions can filter or transform these messages.",
    inspect: "messages shows the conversation context at this hook. It is not the complete serialized provider request; inspect before_provider_request for that.",
  },
  {
    type: "message_update", category: "prompt",
    description: "An assistant message is streaming. Updates may contain text, thinking, tool-call argument deltas, or stream lifecycle markers. The prompt badge is a debugger category, not the message role.",
    inspect: "assistantMessageEvent.type identifies the update kind; message holds the accumulated assistant message. Compact mode groups consecutive updates of the same kind.",
  },
  {
    type: "tool_execution_start", category: "tool",
    description: "Pi has started the lifecycle for a requested tool call, including preflight checks. This appears before tool_call and does not prove the tool body has executed.",
    inspect: "toolName, toolCallId, and args identify the requested operation. Match toolCallId across the remaining tool events.",
  },
  {
    type: "tool_call", category: "tool",
    description: "The pre-execution extension hook is running after tool_execution_start. Extensions can inspect or change input, or block execution.",
    inspect: "toolName, toolCallId, and input show the arguments at this hook; later handlers may still modify them.",
  },
  {
    type: "tool_execution_update", category: "tool",
    description: "A running tool has emitted partial output or progress. Not all tools emit updates, and updates from parallel tools may interleave.",
    inspect: "partialResult contains the progress so far; toolCallId identifies the call it belongs to.",
  },
  {
    type: "tool_result", category: "tool",
    description: "The tool has produced a result, before tool_execution_end. Extensions can modify the result here before it becomes the final tool-result message.",
    inspect: "content, details, isError, and input describe the result at this hook. Match toolCallId; this is not the same event as a message with role toolResult.",
  },
  {
    type: "tool_execution_end", category: "tool",
    description: "The tool call lifecycle is complete, with a final result or error. In parallel execution, calls can complete in a different order from their starts.",
    inspect: "result and isError show the outcome; match toolCallId rather than assuming adjacent rows belong to the same call.",
  },
  {
    type: "before_provider_request", category: "provider",
    description: "The provider-specific request payload has been built and is about to be sent. Extensions can replace it at this hook.",
    inspect: "payload contains the serialized request structure observed by this debugger. Later extension handlers may still change it.",
  },
  {
    type: "after_provider_response", category: "provider",
    description: "Provider response status and headers have arrived, before the response stream is consumed. This does not mean the assistant has finished responding.",
    inspect: "status and headers describe the response metadata. Availability depends on the provider and transport; follow message_update for normalized assistant streaming.",
  },
];
