# Deployment - EVLE Phase 3 Production Calendar

## Frontend Hosting

The frontend is hosted on GitHub Pages as a static Vite build.

Current build system:

```text
Vite + React
```

Current package scripts:

```bash
npm run dev
npm run build
npm run preview
```

## GitHub Pages Base Path

The Vite base path must align with the repository name.

Current expected value:

```js
base: "/evle-p3-7f2a-cal/"
```

If the repository name changes, update `vite.config.js`.

## GitHub Actions Workflow

Expected workflow path:

```text
.github/workflows/deploy.yml
```

Expected deployment flow:

1. Push to `main`.
2. GitHub Actions checks out the repository.
3. Node is configured.
4. Dependencies are installed.
5. Vite build runs.
6. `dist` is uploaded to GitHub Pages.
7. GitHub Pages deploys the site.

Typical commands:

```bash
npm install
npm run build
```

## Static Fallback Data

The GitHub Pages build must publish:

```text
dist/data/events.json
dist/data/cats.json
```

The current build does this by copying the repository `data/` folder into `dist/data/` after `vite build`.

Implications:

- If the Cloudflare Worker can be reached, the app reads shared live data from the Worker.
- If the Worker is blocked, the app falls back to the published static JSON files in read-only mode.
- Because successful Worker writes commit back to the repository JSON files, the next GitHub Pages deployment republishes the updated static fallback data.

## Backend Hosting

The backend is a Cloudflare Worker.

Current known Worker base URL:

```text
https://evle-calendar-api.newbauer.workers.dev
```

This URL is currently referenced by the frontend as `SAVE_SERVICE_BASE`.

## Cloudflare Worker Secrets

Required:

```text
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
EDITOR_KEY
```

Do not commit actual secret values to GitHub.

## Worker API Contract

```text
POST /auth
GET  /events
PUT  /events
GET  /cats
PUT  /cats
```

Expected data paths in GitHub:

```text
data/events.json
data/cats.json
```

## CORS

The Worker must allow the GitHub Pages frontend to call it.

Current permissive pattern:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,PUT,POST,OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Editor-Key
```

If tightening CORS later, explicitly include the GitHub Pages origin and any custom domain.

## Local Development Checklist

1. Clone repository in VS Code.
2. Install dependencies:

```bash
npm install
```

3. Run local dev server:

```bash
npm run dev
```

4. Verify the app loads data from the Worker.
5. Verify the browser console has no CORS errors.
6. Verify edit authentication works.
7. Before committing, run:

```bash
npm run build
```

## Deployment Risk: Blocked Worker API

Some corporate security tools may block the Cloudflare Worker URL. If blocked, the frontend may load but fail to retrieve calendar data.

Potential mitigations:

- Use a custom domain for the Worker.
- Request corporate whitelist approval.
- Add a static read-only fallback to bundled JSON files.
- Host API under an approved organizational domain.
- Replace Worker persistence with an approved internal API.

Do not implement a fallback that silently displays stale data unless the stale-data risk is explicitly accepted.
