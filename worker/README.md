# Cloudflare Worker - EVLE Phase 3 Production Calendar

## Purpose

The Cloudflare Worker is the backend API for the EVLE Phase 3 Production Calendar. It allows the GitHub Pages-hosted frontend to read and write shared calendar data stored as JSON files in the GitHub repository.

## Current Known Worker URL

```text
https://evle-calendar-api.newbauer.workers.dev
```

This value is referenced by the frontend as `SAVE_SERVICE_BASE`.

## Required Secrets / Environment Variables

Set these in Cloudflare Worker settings:

```text
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
EDITOR_KEY
```

Do not commit actual secret values to GitHub.

## API Endpoints

```text
POST /auth
GET  /events
PUT  /events
GET  /cats
PUT  /cats
```

## Data Paths

The Worker reads/writes these files in the GitHub repository:

```text
data/events.json
data/cats.json
```

## Authentication Model

Viewer access:

- `GET /events` requires no editor key.
- `GET /cats` requires no editor key.

Editor access:

- `POST /auth` checks the `X-Editor-Key` header.
- `PUT /events` requires a valid `X-Editor-Key` header.
- `PUT /cats` requires a valid `X-Editor-Key` header.

Header:

```text
X-Editor-Key: <editor key>
```

The Worker compares the header value to the Cloudflare secret:

```text
EDITOR_KEY
```

## GitHub Contents API

The Worker uses the GitHub Contents API to read and update JSON files.

Important implementation requirements:

- Include GitHub token in the Authorization header.
- Retrieve the current file SHA before writing.
- Write JSON with a commit message.
- Use Unicode-safe Base64 encode/decode.

## CORS

The Worker must support browser requests from GitHub Pages.

Expected headers:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,PUT,POST,OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Editor-Key
```

If CORS is tightened later, explicitly include the GitHub Pages origin.

## Deployment Notes

If the Worker is edited in the Cloudflare dashboard, copy the final deployed code back into:

```text
worker/worker.js
```

Reason:
The GitHub repository should preserve a reviewable and recoverable copy of the backend implementation.

## Security Constraints

- Never expose `GITHUB_TOKEN` in frontend code.
- Never expose `EDITOR_KEY` in frontend code.
- Do not allow unauthenticated PUT requests.
- Do not remove editor-key validation.
- Do not broaden write access without explicit approval.

## Operational Risk

Some corporate networks may block the `workers.dev` domain or the specific Worker URL. If blocked, the frontend may fail to load shared calendar data.

Potential mitigations:

- Request corporate whitelist approval.
- Put the Worker behind a custom domain.
- Host API under an approved organizational domain.
- Add an explicitly labeled static read-only fallback.
