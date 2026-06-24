# AI Handoff - EVLE Phase 3 Production Calendar

## Project Summary

This project is the EVLE Phase 3 Production Calendar. It started as a single-file local HTML/React/Babel calendar and is being converted into a production-style Vite + React frontend hosted on GitHub Pages with shared persistence through a Cloudflare Worker API.

## Read These First

Before making changes, read:

```text
PROJECT_CONTEXT.md
docs/AI_HANDOFF.md
docs/DECISIONS.md
docs/KNOWN_ISSUES.md
docs/REPO_MAP.md
docs/DEPLOYMENT.md
```

Then inspect the current implementation files:

```text
src/app.jsx
src/main.jsx
src/index.css
data/events.json
data/cats.json
vite.config.js
worker/worker.js
```

## Active Implementation

The current active frontend implementation is:

```text
src/app.jsx
```

The current backend implementation is:

```text
worker/worker.js
```

If the Worker is not committed to GitHub, the deployed Cloudflare Worker script is still part of the application architecture and must be kept in sync manually.

## Behavioral Baseline

The original single-file HTML calendar is the behavioral baseline. Preserve existing behavior unless the user explicitly asks to change it.

Do not remove working behavior while fixing a specific issue.

## Current Architecture

```text
Vite + React frontend
GitHub Pages static hosting
Cloudflare Worker API backend
GitHub repository JSON files as data persistence
```

The app loads categories and events from the Worker. The Worker reads/writes GitHub JSON files through the GitHub Contents API.

## Data Source of Truth

```text
data/events.json
data/cats.json
```

Do not reintroduce local-only persistence as the primary model.

## Worker Endpoints

```text
POST /auth
GET  /events
PUT  /events
GET  /cats
PUT  /cats
```

Write requests must include:

```text
X-Editor-Key: <editor key>
```

The Worker validates that header against the Cloudflare secret `EDITOR_KEY`.

## Required Worker Secrets

```text
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
EDITOR_KEY
```

Never place these secrets in frontend code.

## Current Important Features

Preserve these unless explicitly directed otherwise:

- Calendar view.
- Timeline view.
- Dynamic category filters.
- Event detail popup.
- Event editor.
- Category manager.
- CSV export.
- CSV import.
- Password-gated editing.
- Autosave to Worker/GitHub.
- Save status display.
- Runtime loading from shared data.
- Fail-closed data loading behavior.
- Dynamic timeline lane generation from `cats.json`.
- Event details field.
- Lookahead side panel.
- Print support.

## Non-Negotiable Constraints

- Do not weaken write security.
- Do not expose `EDITOR_KEY` or GitHub token in frontend code.
- Do not change JSON schemas without a planned migration.
- Do not hardcode swim lanes if they can be derived from `cats.json`.
- Do not assume file paths. Inspect the repository first.
- Do not change the Vite `base` value unless the repository name changes.
- Do not replace Cloudflare Worker persistence unless explicitly approved.
- Do not silently remove features to simplify a fix.

## Recent Work and Decisions

Recent work included:

- Moving toward normalized Vite structure.
- Using `data/events.json` and `data/cats.json` as shared data files.
- Updating Worker paths to read/write `data/events.json` and `data/cats.json`.
- Adding details support to event editing and display.
- Improving CSV import/export behavior.
- Removing or planning removal of unused reset behavior in the Event Editor.
- Dynamically deriving timeline swim lanes from category metadata.
- Refining timeline lane vertical sizing.
- Addressing timeline overlap issues for adjacent events.
- Discussing corporate firewall risk if Cloudflare Worker API is blocked.

## Standard Codex Working Pattern

1. Inspect relevant files first.
2. State exact files that need modification.
3. Make minimal targeted changes.
4. Preserve existing behavior.
5. Run local checks where possible:

```bash
npm install
npm run build
```

6. Summarize changed files and why each changed.
7. Call out any required Cloudflare or GitHub settings changes separately from code changes.
