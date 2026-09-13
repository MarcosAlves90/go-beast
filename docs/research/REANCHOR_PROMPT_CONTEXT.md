# Research brief: lifecycle re-anchor and prompt/context engineering

**Status:** Research only; no source code changes are proposed or made by this brief.

**Research date:** 2026-09-12

**Scope:** The usefulness and design of go-beast's `Stop` re-anchor hook and its
related session-state, user-prompt-context, drift-policy, and implementation-gate
components, informed by current first-party guidance from OpenAI, Anthropic, and
Google.

## Executive conclusion

The re-anchor hook is useful as a recovery signal and as a human-readable
diagnostic, but it should not be treated as proof that a model has recovered
the workflow or will follow it. The strongest part of the current design is the
separation between model-visible context and an executable implementation gate.
The weakest part is the assumption that a missing textual frame is a sufficient
proxy for drift and that a fixed five-stop threshold is a meaningful universal
trigger. The reviewed provider guidance supports concise, structured, explicit
state and success criteria, preserving durable state across context transitions,
and evaluating prompt behavior. It does not support the repository's stronger
unqualified claims that XML or a factual assertion reliably produces a specific
compliance improvement.

Recommended direction: keep re-anchor as a small, provider-adapted context
receipt; trigger it from high-signal state transitions and verified mismatches;
use the executable gate for authorization; and measure recovery, false positives,
task success, latency, and token overhead with a cross-provider evaluation set.

## Evidence boundary

### Direct observations from this repository

The following are source observations, not claims about model behavior:

| Component | Observed behavior | Assessment |
| --- | --- | --- |
| `hooks/go-beast-session-state.sh` | Initializes a per-session JSON state record and detects bootstrap mode. | Good foundation for durable, inspectable state. |
| `hooks/go-beast-drift-lib.sh` | Derives a normalized runtime policy containing beast, applicability, required artifact, approval, completion evidence, task state, and artifact presence; writes through a temporary file and rename. | Useful single vocabulary, but the JSON is still an application-side trust boundary and does not prove that a model's narrative is true. |
| `hooks/go-beast-user-prompt-context.sh` | Recomputes policy on each user prompt and emits a compact XML block through harness-specific `additionalContext` formats. | Appropriate for a small dynamic snapshot; repeated injection can become boilerplate if it grows. |
| `hooks/go-beast-stop-reanchor.sh` | Runs only in bootstrap mode, ignores missing `last_assistant_message`, increments an unanchored-stop counter, waits for five consecutive observations, then emits a text block and exit code 2 for Claude Code/Codex or a JSON block decision for Copilot. | Useful as a bounded recovery interrupt; the threshold is policy, not evidence-based calibration. |
| `hooks/go-beast-implementation-gate.sh` | Independently blocks implementation mutations until the normalized policy says the required artifact and approval/unlock conditions are satisfied, while allowing selected reads. | This is the actual control boundary and should remain authoritative over prompt text. |

The source comments also state that XML improves Claude compliance by “20-40%”
and that factual state assertions outperform imperatives. Those exact claims
were not established by the first-party sources reviewed here. They should be
treated as hypotheses until supported by a repository evaluation or a directly
applicable primary study; they should not be used as design axioms.

### What the provider sources actually support

The providers agree on several broad practices but differ in placement,
reasoning, and state APIs:

* OpenAI recommends message roles and explicit authority, simple/direct prompts
  for reasoning models, delimiters for distinct sections, specific success
  criteria, and evaluation suites when prompts or model versions change. OpenAI
  also recommends preserving compatible reasoning items across tool calls and
  leaving enough context space for reasoning tokens. [OpenAI prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering),
  [OpenAI reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices),
  and [OpenAI reasoning models](https://developers.openai.com/api/docs/guides/reasoning).
* Anthropic recommends clear/direct instructions, explaining motivation when it
  improves targeting, relevant and diverse examples, consistent XML structure,
  long-form data near the top with the query at the end, and explicit
  self-checking where appropriate. Its current guidance also warns against
  blanket tool instructions and over-prompting on newer reasoning models.
  [Anthropic prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices).
* Google recommends putting critical instructions in system instructions or at
  the beginning, putting large context before the question, placing the
  question at the end, using a clear transition such as “Based on the
  information above,” and using consistent XML or Markdown structure. Its
  Gemini 2.5/3 guidance says internal thinking generally removes the need to
  ask for a returned chain of thought. [Google Gemini prompt design
  strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies) and
  [Google Gemini long context](https://ai.google.dev/gemini-api/docs/long-context).

These are provider statements. The model-agnostic inference is narrower:
re-anchor should communicate a small, clearly delimited state snapshot and an
observable success condition; it should not rely on hidden reasoning, a magic
phrase, or a visible acknowledgement as the sole proof of compliance.

## Utility assessment of the current design

### What is valuable

1. **Shared state vocabulary.** Centralizing policy derivation reduces the risk
   that prompt context, the stop hook, and the mutation gate disagree about the
   active phase or artifact.
2. **A compact structured envelope.** XML/Markdown delimiters are explicitly
   supported as clarity aids by OpenAI, Anthropic, and Google. The current block
   is small enough that its cost is likely modest while it remains compact.
3. **A passive period before intervention.** Ignoring absent
   `last_assistant_message` and delaying intervention avoids treating missing
   harness data as model drift. This is a sound failure-mode choice, though the
   five-stop value is not validated.
4. **Independent enforcement.** The implementation gate does not need the model
   to say the right words. This separation matches the general principle that
   context helps an agent decide, while authorization and side-effect checks
   must be enforced by the application/tool boundary. OpenAI's Agents SDK makes
   the same distinction: local application context is not sent to the LLM, and
   capability visibility is not authorization for model-generated arguments.
   [OpenAI Agents SDK context management](https://openai.github.io/openai-agents-python/context/).
5. **Harness-specific output.** Copilot's structured decision path is not treated
   identically to the text-plus-exit-code path used by Claude Code and Codex.
   That adapter seam is the right place for provider/harness differences.

### What is weak or risky

1. **Textual anchoring is an imperfect measurement.** A model can emit the
   expected frame without recovering the correct task, and can omit the frame
   while still acting correctly. The current parser is therefore a heuristic,
   not a state attestation protocol.
2. **The threshold is arbitrary.** Five consecutive `Stop` events may be too
   slow for a high-impact mismatch and too noisy for a short task. It also does
   not distinguish a harmless formatting omission from a phase, artifact, or
   authorization mismatch.
3. **The re-anchor is underspecified about the next observable action.** A state
   declaration tells the model what the runtime believes; it does not by itself
   establish what should be checked next or what evidence would unlock the next
   action.
4. **Repeated policy injection can compete with the task.** Long-context guidance
   consistently warns that more context is not automatically better and that
   context quality degrades as it grows. A re-anchor must therefore be bounded,
   deduplicated, and state-delta oriented.
5. **Instruction authority is not portable by markup alone.** OpenAI's Model Spec
   defines authority by message role and chain of command, while Google and
   Anthropic describe system/developer-style instruction placement and
   structure. XML does not upgrade untrusted user, file, or tool content into a
   higher-authority instruction. [OpenAI Model Spec (2025-12-18)](https://model-spec.openai.com/2025-12-18.html).
6. **The current design has no explicit compaction/resume protocol.** The state
   file survives a session event, but the model-facing contract does not clearly
   distinguish a normal turn, context compaction, model-family change, or a new
   harness. Provider APIs increasingly expose explicit state mechanisms, so a
   generic hook should detect these transitions when the harness exposes them
   rather than infer them from missing prose.
7. **Visible forced formatting can reduce usefulness.** Requiring every next
   response to start with a fixed frame may conflict with a user's requested
   output format and add boilerplate. A recovery receipt should be requested
   only when needed; the gate should not depend on that receipt.

## Provider-specific guidance

### OpenAI

OpenAI's current prompt-engineering documentation says instruction authority is
expressed through message roles and the `instructions` parameter, and that the
`instructions` parameter has priority over `input` in the Responses API. It
recommends an identity/instructions/examples/context structure, while noting
that the optimal order can vary by model. Its reasoning guidance says to keep
reasoning prompts simple and direct, avoid asking for chain of thought, use
delimiters, and state the end goal and success criteria precisely.

For a re-anchor this implies:

* put stable policy in the highest appropriate harness/developer-level channel;
  put dynamic state in a clearly labeled context section;
* ask for a concise state receipt or next action/evidence, not hidden reasoning;
* preserve actual conversation/reasoning state when the provider API supports it;
  do not attempt to reconstruct opaque reasoning from a visible frame;
* use prompt fixtures and evaluations before changing the frame or trigger.

OpenAI's current conversation/compaction documentation supports explicit
server-side or client-managed state and compaction for long-running work. It
also says that reasoning items are opaque and should be passed back unchanged in
the relevant tool-call chain. This is provider capability, not a portable
assumption for shell hooks. [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state),
 [compaction](https://developers.openai.com/api/docs/guides/compaction), and
 [reasoning continuity](https://developers.openai.com/api/docs/guides/reasoning).

### Anthropic

Anthropic's current guidance gives strong support to the current use of
descriptive XML tags, but it also says to use targeted instructions rather than
blanket defaults, and to tune effort/automatic thinking rather than forcing a
hand-written reasoning procedure. For long context it recommends long-form data
near the top, queries at the end, explicit document metadata, and grounding
responses in relevant quotes.

Anthropic's context-window documentation describes context as working memory,
warns that accuracy and recall degrade as context grows, and recommends fast
state artifacts for recovery across sessions. Its compaction documentation calls
server-side compaction the recommended strategy for long-running conversations
and agentic workflows. Its memory documentation describes just-in-time retrieval
from persistent files rather than loading all knowledge up front.

For a re-anchor this implies:

* retain XML as a readability boundary, not as a claimed authority mechanism;
* keep the snapshot short and put the task query/next action after state when the
  snapshot is embedded in a long prompt;
* maintain a durable recovery artifact with current phase, pending work,
  decisions, and verification evidence;
* avoid “always be thorough” or “if in doubt, use a tool” language in every
  re-anchor; target the actual failure.

Sources: [Anthropic context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows),
 [Anthropic compaction](https://platform.claude.com/docs/en/build-with-claude/compaction),
 and [Anthropic memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool).

### Google Gemini

Google's current Gemini 3 guidance recommends critical instructions in the
system instruction or at the beginning, large context before the question, the
question at the end, and a transition that explicitly anchors the question to
the preceding data. It recommends consistent XML or Markdown delimiters. Its
agentic-workflow guidance explicitly separates logical decomposition,
execution/recovery, risk assessment, ambiguity/permission handling, and
precision/completeness. It also notes that persistence and recovery can increase
success while risking higher token cost or loops.

For a re-anchor this implies:

* provide critical invariants through the strongest supported instruction
  channel; do not assume a hook's `additionalContext` has identical authority
  across harnesses;
* place the current state before the final task/next-action question when the
  total context is large, and use an explicit bridge phrase;
* specify recovery and risk behavior, but keep persistence bounded and observable;
* if using Gemini stateful interactions or tool context circulation, preserve the
  provider's state identifiers/signatures rather than replacing them with a
  textual frame. [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview)
  and [tool context combination](https://ai.google.dev/gemini-api/docs/tool-combination).

## Recommendation matrix

Priority uses `P0` for correctness/safety foundations, `P1` for high-value
reliability work, and `P2` for optimization after measurement.

| Area | Source-backed finding | Recommendation for go-beast | Priority / measure |
| --- | --- | --- | --- |
| State envelope | OpenAI, Anthropic, and Google all describe explicit structure/delimiters as useful; none says markup alone establishes authority. | Define a versioned envelope with explicit `source`, `task_id`, `phase`, `task_state`, `required_artifact`, `artifact_status`, `approval`, `next_check`, `evidence`, and `generated_at`. Label runtime facts separately from user/tool data. | P0; parseability, stale-state rejection, injection tests |
| Instruction hierarchy | OpenAI says higher-authority roles override lower ones and quoted/tool/file content is untrusted by default. | Keep policy/invariants in the strongest harness-supported channel; mark state and retrieved content as data; never let a model-generated frame grant approval. | P0; mutation attempts with conflicting user/file/tool text |
| Triggering | Provider guidance supports targeted instructions and warns about over-prompting; no reviewed source validates a fixed five-turn rule. | Replace the universal counter as the primary trigger with high-signal events: new task/beast, phase mismatch, missing/changed artifact, blocked mutation, resume/compaction, provider/harness transition, or verified completion inconsistency. Use a counter only as a bounded fallback with cooldown/backoff. | P0; time-to-recovery, false-positive rate, loop rate |
| Re-anchor payload | Reasoning models generally need concise goals and criteria, not a requested chain of thought. | Emit a short state receipt plus one observable next check/evidence requirement. Do not ask for hidden reasoning or require a fixed visible prefix on every response. | P0; task success, response utility, added tokens |
| Per-prompt injection | Long-context sources warn that context grows and quality can degrade; Google/Anthropic recommend explicit placement for large context. | Inject a stable contract once per session where possible; inject only dynamic deltas thereafter; cap size; place state according to harness/provider adapter. | P1; prompt-token overhead, latency, recovery after compaction |
| Session recovery | Anthropic recommends fast recovery artifacts; OpenAI and Google expose stateful/compaction mechanisms; state is provider-specific. | Maintain a minimal durable recovery artifact and a provider-neutral snapshot. On resume/compaction, re-anchor from the artifact, not from a guessed transcript. | P1; resume success, artifact completeness, stale-artifact cases |
| Reasoning continuity | OpenAI says reasoning is opaque and compatible reasoning/tool items should be preserved; Anthropic and Google expose their own state/thinking mechanisms. | Never parse or imitate hidden reasoning. Preserve native provider state when available; otherwise carry forward only verified task facts and evidence. | P1; tool-chain continuation, model-family switch behavior |
| Enforcement | OpenAI Agents SDK distinguishes LLM context from local policy and says visibility is not authorization. | Keep `go-beast-implementation-gate.sh` as the side-effect control. Treat prompt re-anchor as advisory/recovery, not authorization. | P0; blocked unauthorized mutation rate |
| Provider adapters | Placement and state semantics differ across OpenAI, Anthropic, and Gemini. | Add adapter-level policies for channel, ordering, state continuation, and output contract. Keep the core state schema provider-neutral. | P1; same scenario across three harness/provider profiles |
| Verification | OpenAI recommends prompt tests/evals when changing prompts or models; Anthropic/Google describe behavior knobs with cost/quality trade-offs. | Add a deterministic fixture suite plus live, version-pinned evals where credentials/models permit. Compare no re-anchor, current, and proposed protocol. | P0; completion, drift recovery, false blocks, cost, latency |
| Evidence claims | The reviewed official docs support structure and targeted prompting, not the repository's exact “20-40%” claim. | Remove or qualify unsupported quantitative comments unless a reproducible primary experiment is added. | P0; every numeric claim has a source or local measurement |
| Privacy and integrity | Provider state/memory features can retain conversation or artifacts; Google explicitly documents storage/retention controls and Anthropic documents persistent memory. | Minimize state fields, exclude secrets, define retention/deletion, validate paths, and record only evidence needed for recovery. | P0; secret/PII scans, retention tests |

## Proposed improvement plan

### Phase 0 — establish a measurable baseline

* Freeze a small set of representative scenarios: normal short task, long tool
  loop, missing artifact, wrong phase, blocked mutation, context resume, user
  format constraint, and prompt-injection text in a file/tool result.
* Measure current behavior without changing the hook: task completion, correct
  artifact selection, unauthorized mutation blocks, number of re-anchors, added
  tokens, latency, and user-visible boilerplate.
* Mark unsupported prompt claims as hypotheses in the evaluation notes.

### Phase 1 — make state explicit and bounded

* Define a versioned provider-neutral state schema and an integrity/ freshness
  policy. Include a task identifier and generation timestamp/sequence.
* Separate `runtime_facts`, `task_data`, `required_action`, and `evidence`; do
  not mix user/tool text with control fields.
* Keep the visible snapshot below a documented budget and emit deltas when the
  state is unchanged.

### Phase 2 — replace magic-threshold recovery with signal-aware recovery

* Re-anchor on lifecycle transitions and verified policy mismatches.
* Retain a small fallback counter only for repeated unanchored responses, with
  cooldown/backoff and a maximum number of interventions per task.
* Reset the fallback only on a structured, syntactically valid receipt plus an
  independent state check; a phrase alone must not reset authorization.

### Phase 3 — design the recovery receipt

* Use a compact, consistently delimited block such as `state`, `constraints`,
  `next_check`, and `evidence`; avoid a request for chain-of-thought.
* Ask for one concrete next check or user-facing clarification when the state is
  ambiguous. For a blocked implementation, direct the model to inspect or
  produce the missing artifact; let the gate decide whether mutation is allowed.
* Do not impose a fixed prefix on every response. If a harness requires a
  visible receipt, make it event-scoped and allow the user's requested output
  format after the receipt.

### Phase 4 — add provider/harness profiles

* OpenAI profile: use the strongest available developer/instruction channel,
  preserve native conversation/reasoning state where supported, and keep the
  re-anchor direct and success-criteria oriented.
* Anthropic profile: retain XML boundaries, use targeted rather than blanket
  instructions, and integrate with compaction/memory or durable artifacts when
  those facilities exist.
* Gemini profile: place critical constraints in system instructions, put large
  state/context before the final task question, and preserve interaction/tool
  identifiers and signatures in stateful or tool-circulation flows.
* Generic profile: use the common schema and only the harness contract that can
  be observed and tested.

### Phase 5 — validate and roll out safely

* Run the same scenarios against each profile and model class; pin model
  snapshots where possible and record provider/documentation access dates.
* Use staged rollout/configuration to compare current and proposed behavior.
* Prefer the smallest protocol that improves recovery without increasing false
  interventions, context cost, or user-visible boilerplate.

## Risks and mitigations

| Risk | Mechanism | Mitigation |
| --- | --- | --- |
| Prompt injection | A file, tool result, or user message can contain text that resembles a state frame or attempts to override policy. | Delimit as untrusted data, apply explicit authority rules, validate state in the hook, and keep mutation authorization outside the model. |
| False positive loop | A formatting omission or harness that does not expose the last message repeatedly triggers re-anchor. | Treat absent signals as neutral, use event-specific triggers, cooldown/backoff, and a stop-loop guard. |
| False negative | The model emits the expected frame while using the wrong artifact or phase. | Verify artifact/status and policy state independently; do not let textual acknowledgement unlock tools. |
| Context rot and cost | Repeating policy and history consumes context and can reduce recall/latency. | Stable-prefix/delta injection, strict size budget, compaction/resume artifacts, and token/latency metrics. |
| Cross-provider regression | A message channel or context position has different semantics in another harness/provider. | Adapter profiles and the same cross-provider scenario suite; no markup-only portability claim. |
| User-format conflict | Forced XML/prefix text can violate a requested output format. | Scope visible receipts to recovery events and preserve the requested format afterward. |
| State leakage | Durable state can contain paths, task details, or sensitive data. | Data minimization, path validation, retention/deletion policy, and secret/PII tests. |
| Stale state after task switch | Old approval or completion evidence is carried into a new task. | Task IDs, generation numbers, explicit invalidation on task/beast change, and fail-closed gate behavior. |
| Over-verification | Repeated self-check instructions increase tokens and latency without improving quality on every model. | Make checks targeted and measure them; use provider effort/configuration where available. |

## Source register and publication/access context

All links below are first-party provider documentation or first-party provider
model specifications. The pages without an explicit publication date are live
documentation; this brief records the access date rather than inventing a
publication date.

| Provider | Source | Publication/access context | Relevant sections |
| --- | --- | --- | --- |
| OpenAI | [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering) | Live OpenAI API documentation; accessed 2026-09-12. | Roles/authority, Markdown/XML structure, prompt versioning/evals. |
| OpenAI | [Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices) | Live OpenAI API documentation; accessed 2026-09-12. | Simple/direct prompts, avoid chain-of-thought prompting, delimiters, success criteria, prompt evaluation. |
| OpenAI | [Reasoning models](https://developers.openai.com/api/docs/guides/reasoning) | Live OpenAI API documentation; accessed 2026-09-12. | Reasoning tokens, context budget, reasoning continuity, compaction/tool-call continuity. |
| OpenAI | [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state) | Live OpenAI API documentation; accessed 2026-09-12. | Multi-turn state patterns. |
| OpenAI | [Compaction](https://developers.openai.com/api/docs/guides/compaction) | Live OpenAI API documentation; accessed 2026-09-12. | Server-side/client-managed compaction for long-running interactions. |
| OpenAI | [Model Spec](https://model-spec.openai.com/2025-12-18.html) | Official Model Spec version dated 2025-12-18; accessed 2026-09-12. | Chain of command, instruction authority, untrusted quoted/tool/file data. |
| OpenAI | [Agents SDK context management](https://openai.github.io/openai-agents-python/context/) | Live official OpenAI Agents SDK documentation; accessed 2026-09-12. | Local context versus LLM context, capability visibility versus authorization, retrieval/tool context. |
| Anthropic | [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) | Live Claude Platform documentation; accessed 2026-09-12. | Clarity, motivation, examples, XML, long context, thinking, self-checking, agentic state tracking. |
| Anthropic | [Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows) | Live Claude Platform documentation; accessed 2026-09-12. | Working-memory limits, context rot, context awareness, recovery artifacts, compaction. |
| Anthropic | [Compaction](https://platform.claude.com/docs/en/build-with-claude/compaction) | Live Claude Platform documentation; accessed 2026-09-12. | Recommended server-side compaction for long-running agentic workflows. |
| Anthropic | [Memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) | Live Claude Platform documentation; accessed 2026-09-12. | Just-in-time persistent memory and cross-session files. |
| Google | [Gemini prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies) | Live Google AI for Developers documentation; accessed 2026-09-12. | Instruction placement, long-context ordering, anchoring phrase, structured prompts, agentic recovery/risk guidance. |
| Google | [Gemini long context](https://ai.google.dev/gemini-api/docs/long-context) | Live Google AI for Developers documentation; accessed 2026-09-12. | Long-context trade-offs, query placement, caching, multiple-needle limitations. |
| Google | [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview) | Live Google AI for Developers documentation; accessed 2026-09-12. | Stateful interaction continuity, previous interaction IDs, retention and storage controls. |
| Google | [Gemini tool context combination](https://ai.google.dev/gemini-api/docs/tool-combination) | Live Google AI for Developers documentation; accessed 2026-09-12. | Preserving IDs/signatures and stateful versus stateless tool context. |

## Decision summary

The recommended target is not a more forceful universal prompt. It is a
smaller and more explicit recovery protocol:

1. durable, versioned state artifact;
2. compact, delimited, provider-adapted snapshot;
3. event- and mismatch-driven re-anchor with bounded fallback;
4. observable next check and evidence requirement;
5. independent side-effect enforcement; and
6. cross-provider evaluation before rollout.

This preserves the current architecture's best property—the executable gate—
while replacing unvalidated assumptions about formatting and fixed thresholds
with measured, provider-aware context engineering.
