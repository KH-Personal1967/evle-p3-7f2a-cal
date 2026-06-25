# Changelog - EVLE Phase 3 Production Calendar

Use this file to record every material change made to the project.

## 2026-06-24

- Added project continuity documentation for VS Code and Codex migration.
- Revised `PROJECT_CONTEXT.md` to document architecture, data contracts, runtime flow, and constraints.
- Added `docs/AI_HANDOFF.md` for future AI-assisted development sessions.
- Added `docs/DECISIONS.md` for architectural decision tracking.
- Added `docs/DEPLOYMENT.md` for GitHub Pages and Cloudflare Worker deployment notes.
- Added `docs/KNOWN_ISSUES.md` for open issues and risks.
- Added `docs/REPO_MAP.md` for repository navigation.
- Added `worker/README.md` for Cloudflare Worker operational context.

## 2026-06-25

- Added static read-only fallback loading from published `data/events.json` and `data/cats.json` when the Cloudflare Worker API cannot be reached.
- Blocked entry into edit mode when the shared API is unavailable, with an edit-button warning instead of a persistent status banner.
- Updated the build script to copy `data/` into `dist/data/` for GitHub Pages fallback reads.
- Replaced the generic print action with a calendar-only PDF export that generates one landscape letter page per month.
- Added a PDF export options dialog for choosing all vs. filtered events, month range, and 8.5x11 vs. 11x17 landscape output.

## Prior Context From Development Discussions

- App migrated from single-file local HTML/React/Babel toward Vite + React.
- GitHub Pages selected for frontend hosting.
- Cloudflare Worker selected for shared API and GitHub JSON persistence.
- `data/events.json` selected as the event source of truth.
- `data/cats.json` selected as the category source of truth.
- Worker endpoints defined for `/auth`, `/events`, and `/cats`.
- Editor write protection uses `X-Editor-Key` checked against Worker secret `EDITOR_KEY`.
- Event Editor improvements discussed and/or implemented:
  - Details column.
  - CSV import/export refinement.
  - Manage Categories button naming.
  - Removal of reset button behavior.
  - Consistent input box sizing.
- Timeline refinements discussed and/or implemented:
  - Dynamic lane generation from categories.
  - Reduced excess vertical lane space.
  - Adjacent date event overlap correction.
  - Dynamic event row expansion in calendar view.
- Corporate firewall risk identified for Cloudflare Worker API access.
