# Contributing to Dayla

Dayla is a small, Korean-language, local demonstration for older adults. Read `docs/DESIGN.md` and `docs/ACCEPTANCE.md` first.

## Local development

Use Node.js 22.12 or later, install with `npm ci`, and run `npm run dev`. Keep changes focused on one responsibility. Client UI lives in `src/client`, server state and persistence in `src/server`, and transport types in `src/shared`. Tests must verify outcomes rather than duplicate implementation.

Before submitting, run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Run `npm run test:e2e` with Playwright Chromium installed for changes to user flows. Document any unavailable manual voice or assistive-technology checks.

Do not commit databases, credentials, raw session logs, recordings, or actual family/health data. Do not introduce sending adapters, remote speech, medication recommendations, or hidden monitoring as incidental changes.

## Development tools

Codex implemented the initial app after the user explicitly decoupled it from Cline authentication. Cline is a development tool, not an app dependency. Contributors may use the official Cline CLI or extension later; see `docs/CLINE_TASK.md` and `docs/CLINE_STATUS.md`. Never represent a failed authentication attempt as a successful Cline coding session.

## Design attribution

Selected layout and card styling is adapted from Project-1. Keep the upstream MIT notice and exact provenance in `THIRD_PARTY_NOTICES.md`. Its image assets and logos are not included.

## Commits

Start commit messages with the reason for the change. Use concise decision trailers where relevant: `Tested:`, `Not-tested:`, `Constraint:`, `Confidence:`, and `Scope-risk:`. Never force push over someone else's work.
