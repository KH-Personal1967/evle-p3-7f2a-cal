# Architectural Decisions - EVLE Phase 3 Production Calendar

## Decision Log Format

Use this structure for future decisions:

```text
Date:
Decision:
Reason:
Implications:
Files affected:
```

## 2026-06-24 - Preserve Original Calendar Behavior as Baseline

Decision:
The original single-file HTML calendar remains the behavioral baseline.

Reason:
The Vite + React app is a production conversion of an existing working app. Refactors should not unintentionally change expected behavior.

Implications:
When behavior changes, confirm whether the change was intentional. Do not remove UI features while fixing unrelated defects.

Files affected:

```text
src/app.jsx
```

## 2026-06-24 - Use GitHub JSON Files as Data Source of Truth

Decision:
Events and categories are stored in GitHub JSON files.

Reason:
This allows the GitHub repository to remain the auditable source of project schedule data while still allowing edits through the browser.

Implications:
The Worker must read and write:

```text
data/events.json
data/cats.json
```

Files affected:

```text
data/events.json
data/cats.json
worker/worker.js
src/app.jsx
```

## 2026-06-24 - Use Cloudflare Worker as API and Persistence Layer

Decision:
The frontend does not write directly to GitHub. All shared reads/writes go through a Cloudflare Worker.

Reason:
GitHub tokens and editor secrets must not be exposed in browser code.

Implications:
The Worker must keep these secrets server-side:

```text
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
EDITOR_KEY
```

Files affected:

```text
worker/worker.js
src/app.jsx
```

## 2026-06-24 - Protect Writes With X-Editor-Key

Decision:
Write requests use the `X-Editor-Key` request header, validated by the Worker against `EDITOR_KEY`.

Reason:
Viewer users should be able to read the calendar, but only authorized editors should write to GitHub.

Implications:
Do not move the editor key or GitHub token into frontend code.

Files affected:

```text
worker/worker.js
src/app.jsx
```

## 2026-06-24 - Derive Timeline Swim Lanes From cats.json

Decision:
Timeline lanes should be dynamically generated from category metadata in `cats.json`, especially `timelineLane` and `sortOrder`.

Reason:
Hardcoded swim-lane definitions create discrepancies when categories are edited through the Manage Categories UI.

Implications:
Do not reintroduce hardcoded `SWIM_LANE_DEFS` unless explicitly requested.

Files affected:

```text
src/app.jsx
data/cats.json
```

## 2026-06-24 - Keep GitHub Pages Base Path Aligned With Repo Name

Decision:
The Vite `base` path must match the GitHub Pages repository path.

Current expected value:

```js
base: "/evle-p3-7f2a-cal/"
```

Reason:
GitHub Pages serves project sites under the repository name. Incorrect base paths break asset loading.

Files affected:

```text
vite.config.js
```
