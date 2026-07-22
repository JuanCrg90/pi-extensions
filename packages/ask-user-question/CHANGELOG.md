# Changelog

## [Unreleased]

## [1.0.0] - 2026-07-10

### Added
- Global `AskUserQuestion` tool with strict TypeBox input schema
- Stable ID-keyed single-select and multi-select results
- Auto-injected `Other...` answers with lossless re-editing
- Explicit empty multi-select confirmation
- Batched question navigation and review/submit flow
- Optional-question support with required-question validation
- Per-option and question-level notes
- Plain-text single-select previews with wide and narrow layouts
- Recommended-option markers
- External `AbortSignal` cancellation and low-noise progress milestones
- Compact tool call and result transcript renderers
- Official Pi TUI input, composition, border, focus, and theme controls
- Package-root extension entrypoint
- Unit and runtime regression coverage

### Changed
- Include the complete structured result in model-visible tool content so
  answers, annotations, previews, and metadata are available to follow-up
  responses
- Render multi-select selections in deterministic option order
- Wrap chips and dialog output to terminal width

### Fixed
- Restore Pi's working indicator on every completion and cancellation path
- Return `terminate: true` when the dialog is dismissed
- Handle real terminal key sequences through Pi key matching
- Prevent input-mode shortcuts from consuming typed characters
- Preserve saved custom answers when edits are cancelled
- Restore useful focus when revisiting questions
- Omit unanswered optional questions and empty annotations from results
- Keep help text, prompt guidance, README, validation, and runtime behavior aligned
