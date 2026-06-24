# EVLE Phase 3 Production Calendar - Project Context

## Purpose

This project maintains the EVLE Phase 3 Production Calendar, a browser-based milestone and scheduling calendar used to track project events, freezes, workshops, holidays, reviews, production schedule activities, and related project coordination items.

The current objective is to continue converting and stabilizing the original single-file local HTML/React/Babel calendar into a production-style Vite + React frontend hosted on GitHub Pages with shared data persistence through a Cloudflare Worker API.

## Current Production Architecture

- Frontend: Vite + React
- Hosting: GitHub Pages
- Backend API: Cloudflare Worker
- Data source of truth: JSON files committed in the GitHub repository
- Events data: `data/events.json`
- Categories data: `data/cats.json`
- Active frontend implementation: `src/app.jsx`
- Frontend entry point: `src/main.jsx`
- Backend Worker implementation: `worker/worker.js`, or the corresponding deployed Cloudflare Worker script if not committed to GitHub

## Intended Runtime Flow

1. Browser loads the GitHub Pages-hosted Vite app.
2. `src/app.jsx` calls the deployed Cloudflare Worker API.
3. Worker reads and writes `data/events.json` and `data/cats.json` through the GitHub Contents API.
4. Viewer users can read calendar data without an editor key.
5. Editor users unlock edit mode using the editor key.
6. Write requests include the `X-Editor-Key` request header.
7. Worker validates `X-Editor-Key` against the Cloudflare secret `EDITOR_KEY` before writing.
8. Successful writes commit updated JSON back to GitHub.

## Cloudflare Worker API Contract

The Worker must implement these endpoints:

```text
POST /auth
GET  /events
PUT  /events
GET  /cats
PUT  /cats
```

Expected responses:

```text
GET /events -> { updatedUtc, events: [...] }
GET /cats   -> { ...categoryObject }
```

Write protection:

```text
X-Editor-Key: <editor key>
```

Required Worker secrets or environment variables:

```text
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
EDITOR_KEY
```

## Data Contracts

### `data/events.json`

Expected shape:

```json
{
  "updatedUtc": "2026-05-21T00:00:00Z",
  "events": [
    {
      "id": 1,
      "label": "Event label",
      "start": "2026-05-15",
      "end": "2026-05-15",
      "cat": "milestone",
      "crit": true,
      "details": "Optional details"
    }
  ]
}
```

Rules:

- `id` must remain unique.
- `start` and `end` use `YYYY-MM-DD`.
- `end` must not be earlier than `start`.
- `cat` should match a key in `data/cats.json`.
- `crit` is boolean.
- `details` is optional and should remain backward compatible.

### `data/cats.json`

Expected shape:

```json
{
  "milestone": {
    "label": "Milestone / Submittal",
    "hex": "#f59e0b",
    "timelineLane": "Milestones",
    "sortOrder": 10
  }
}
```

Rules:

- Category object keys are stable IDs used by events.
- `label` is the user-facing category name.
- `hex` is the category color.
- `timelineLane` controls the swim lane label in timeline view.
- `sortOrder` controls lane/category ordering.
- Timeline lanes should be derived dynamically from `cats.json`; do not reintroduce hardcoded swim-lane definitions unless explicitly requested.

## Target Folder Structure

```text
repo-root/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── public/
│   ├── favicon.ico
│   └── robots.txt
├── src/
│   ├── main.jsx
│   ├── app.jsx
│   └── index.css
├── data/
│   ├── events.json
│   └── cats.json
├── worker/
│   ├── worker.js
│   └── README.md
├── docs/
│   ├── AI_HANDOFF.md
│   ├── CHANGELOG.md
│   ├── DECISIONS.md
│   ├── DEPLOYMENT.md
│   ├── KNOWN_ISSUES.md
│   └── REPO_MAP.md
├── index.html
├── package.json
├── vite.config.js
├── README.md
└── .gitignore
```

## GitHub Pages Requirements

- `vite.config.js` must keep the `base` path aligned with the GitHub repository name.
- Current expected base path:

```js
base: "/evle-p3-7f2a-cal/"
```

- The deploy workflow should build with `npm run build` and deploy the `dist` folder to GitHub Pages.
- `index.html` should load `/src/main.jsx` during Vite development/build.

## Current App Behavior to Preserve

Unless explicitly requested otherwise, preserve these behaviors:

- Calendar view.
- Timeline view.
- Dynamic category filters.
- Category manager.
- Event editor.
- CSV export.
- CSV import.
- Password-gated edit mode.
- Autosave to shared data source after edits.
- Save status indicator.
- Runtime loading from Cloudflare Worker.
- Fail-closed behavior when shared calendar data cannot be loaded.
- Details field display and editing.
- Dynamic timeline swim lanes derived from category configuration.
- Multi-day timeline bars.
- Single-day timeline diamonds.
- Jump-to-today behavior.
- Lookahead side panel.

## Development Baseline

The original single-file local HTML calendar remains the behavioral baseline. The current active implementation is `src/app.jsx`. When behavior differs, confirm whether the difference was intentional before refactoring.

## Coding Constraints

- Do not invent missing repository details.
- Inspect files before editing.
- Prefer minimal, targeted changes.
- Preserve schema compatibility unless a migration is explicitly planned.
- Do not weaken validation.
- Do not expose secrets in client-side code.
- Do not move the editor key into the frontend.
- Do not replace the Cloudflare Worker persistence model without explicit approval.
- Keep Cloudflare Worker CORS handling compatible with GitHub Pages.
- Keep Unicode-safe Base64 handling in Worker GitHub writes.
- Maintain compatibility with browser-only deployment on GitHub Pages.

## Known External Risk

The deployed Cloudflare Worker API may be blocked by corporate security tools such as Palo Alto URL filtering. If the Worker URL is blocked, the app may fail closed and display no calendar data. Long-term mitigations may include a custom domain, alternate API domain, static read-only fallback, or a different persistence pattern.

## Recommended Start Prompt for Codex

```text
Read PROJECT_CONTEXT.md and all files in docs/. Then inspect src/app.jsx, data/events.json, data/cats.json, vite.config.js, and worker/worker.js before proposing changes. Preserve existing behavior unless I explicitly ask for a refactor. Do not change data contracts or security behavior without calling it out first.
```
