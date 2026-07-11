# Changelog

## [Unreleased]

### Added
- AskUserQuestion tool scaffold and schema/validation layer
- Stable ID-keyed answers and annotations
- Single-select, multi-select, `Other...`, notes, review flow, preview panel
- Plain-text single-select preview with side-by-side / stacked layouts
- Runtime `_signal` abort support and `_onUpdate` milestones
- Custom `renderCall` / `renderResult` summaries
- Runtime / presentation / preview / review regression tests

### Fixed
- One-question flows now submit immediately
- Multi-question flows no longer start inside review mode
- Review submit now completes cleanly through outer result builder
- `Tab` question switching now advances correctly
- Revisiting `Other...` restores focus correctly
- Multi-select `Space` on `Other...` no longer crashes
- Unanswered multi-select questions are omitted from result answers
- Help and controls text now match real behavior
- Required-question checks ignore `required: false`
- Working indicator restore now guaranteed in `finally`
