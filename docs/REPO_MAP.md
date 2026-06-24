# Repository Map - EVLE Phase 3 Production Calendar

## Root

```text
index.html
package.json
vite.config.js
README.md
PROJECT_CONTEXT.md
.gitignore
```

### `index.html`

Vite HTML entry file. Loads the React app through:

```html
<script type="module" src="/src/main.jsx"></script>
```

Also includes noindex metadata.

### `package.json`

Defines npm scripts and dependencies.

Expected scripts:

```text
dev
build
preview
```

Expected major dependencies:

```text
react
react-dom
vite
@vitejs/plugin-react
```

### `vite.config.js`

Vite config. Critical for GitHub Pages because it defines the project base path.

Current expected base:

```js
base: "/evle-p3-7f2a-cal/"
```

### `PROJECT_CONTEXT.md`

Primary project context for AI tools and future maintainers.

## `.github/workflows/`

```text
.github/workflows/deploy.yml
```

GitHub Actions workflow for deploying the Vite build to GitHub Pages.

## `public/`

```text
public/favicon.ico
public/robots.txt
```

Static public assets copied to the site root during build.

## `src/`

```text
src/main.jsx
src/app.jsx
src/index.css
```

### `src/main.jsx`

React entry point. Imports `index.css` and renders `App` from `app.jsx`.

### `src/app.jsx`

Main application implementation.

Contains:

- Save service configuration.
- Theme constants.
- Category context.
- Date utilities.
- Shared Worker load/save helpers.
- Calendar grid helpers.
- CSV import/export helpers.
- Calendar components.
- Event detail popup.
- Event edit modal.
- Category manager.
- Event editor table.
- Timeline view.
- Side panel.
- Main app state and persistence logic.

This is the main file to inspect before UI or behavior changes.

### `src/index.css`

Global CSS for root height, body margin, font family, and overflow behavior.

## `data/`

```text
data/events.json
data/cats.json
```

### `data/events.json`

Shared event data. Used by the Worker and committed to GitHub.

### `data/cats.json`

Shared category data. Used by the Worker and committed to GitHub.

Category fields include:

```text
label
hex
timelineLane
sortOrder
```

## `worker/`

```text
worker/worker.js
worker/README.md
```

### `worker/worker.js`

Cloudflare Worker API implementation.

Expected responsibilities:

- Handle CORS.
- Validate editor key for writes.
- Read GitHub JSON files.
- Write GitHub JSON files.
- Use Unicode-safe Base64 encode/decode for GitHub Contents API.

### `worker/README.md`

Operational notes for Cloudflare Worker deployment and required secrets.

## `docs/`

```text
docs/AI_HANDOFF.md
docs/CHANGELOG.md
docs/DECISIONS.md
docs/DEPLOYMENT.md
docs/KNOWN_ISSUES.md
docs/REPO_MAP.md
```

### `docs/AI_HANDOFF.md`

Instructions for future AI-assisted development sessions.

### `docs/CHANGELOG.md`

Chronological record of changes.

### `docs/DECISIONS.md`

Architectural decisions and rationale.

### `docs/DEPLOYMENT.md`

GitHub Pages and Cloudflare Worker deployment notes.

### `docs/KNOWN_ISSUES.md`

Open issues, risks, and known follow-up work.

### `docs/REPO_MAP.md`

This file. Repository navigation guide.
