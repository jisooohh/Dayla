# Later Cline development handoff

Continue improving the implemented Dayla app in this repository using IMPLEMENTATION_PLAN.md, ACCEPTANCE.md and DESIGN.md in this folder. DESIGN.md supersedes the original palette. Build a coherent Korean PC-first demonstration with actual local persistence and fictional data only. The user authorized Codex to implement the initial version before Cline authentication. Inspect the actual baseline first, choose one bounded improvement, and then own that code change and its tests. Codex can review the resulting diff. Do not rebuild the app or claim earlier work was performed by Cline.

Use React/Vite/TypeScript, Express, better-sqlite3, node-cron and rss-parser only where needed. Inspect Node engine requirements before pinning dependencies. Prefer a single npm package with clear client/server/shared directories. Do not add generic frameworks or unused abstractions. Tests must prove behavior, especially restart/idempotency/negative paths.

Keep the existing code-level styling adaptations from the Project-1 GitHub repository at the documented commit; preserve MIT notice and document destination paths. No external photos/logos/fonts. Use the cream/orange design with accessible dark text, spacious cards and big controls. Preserve all three medication response choices and correction history.

Preserve the implemented demo flow with labeled simulated time, durable response storage, helper schedule, local family draft and source-attributed news feed. Do not claim simulation as real actions. No sending, no remote STT, no background-alarm guarantees and no medical advice. A failed speech or save must remain visibly failed.

Keep server localhost-only, restrict request origins/mutations appropriately, validate payloads and bound RSS fetching. Ignore local DBs/secrets. Do not modify Git remotes, force push, deploy, purchase anything or change credentials. Run typecheck, lint, behavior tests and build and report exact outcomes. Record actual versions/license notices and sanitized Cline session evidence. Stop and report genuine blockers; do not bypass failed requirements.
