# Known Issues and Risks - EVLE Phase 3 Production Calendar

## 1. Corporate Blocking of Cloudflare Worker API

Issue:
The Cloudflare Worker API URL may be blocked by corporate security tools such as Palo Alto URL filtering.

Impact:
The GitHub Pages frontend may load, but shared events and categories fail to load. The current app is intended to fail closed rather than display stale fallback data.

Potential mitigations:

- Request whitelist approval for the Worker URL.
- Use a custom domain for the Worker.
- Host API under an approved organizational domain.
- Add an explicitly-labeled static read-only fallback.
- Move persistence to an approved internal platform.

## 2. Timeline Adjacent Event Overlap

Issue:
Timeline view previously showed apparent overlap for events where one ends and another begins the following day.

Expected behavior:
Adjacent events should visually butt up to each other without overlap. This should hold at all zoom levels.

Relevant area:

```text
src/app.jsx
TimelineView
layoutLane
```

## 3. Calendar Dynamic Row Expansion

Issue:
Calendar month view previously limited visible event rows and displayed a `+#` indicator that did not expand events.

Expected behavior:
If more than four events are present in a week/day area, the calendar should dynamically display as many rows as needed or provide a functional expansion behavior.

Relevant area:

```text
src/app.jsx
WeekRow
MonthGrid
layoutWeek
```

## 4. Timeline Lane Height Excess Space

Issue:
Timeline swim lanes have had excess bottom space.

Expected behavior:
Top and bottom padding should be visually balanced, and lane height should be derived from actual track count plus consistent padding.

Relevant area:

```text
src/app.jsx
TimelineView
TL_BAR_H
TL_TRACK_H
TL_PAD
```

## 5. Category and Timeline Lane Synchronization

Issue:
Hardcoded swim lane definitions can conflict with categories modified through Manage Categories.

Expected behavior:
Timeline lanes should be built dynamically from `cats.json`, using `timelineLane` and `sortOrder`.

Relevant area:

```text
data/cats.json
src/app.jsx
buildTimelineLaneDefs
CategoryManager
```

## 6. Worker Source Location

Issue:
The Worker may exist only in Cloudflare and not in GitHub.

Expected behavior:
Keep a copy in `worker/worker.js` for version control, review, and recovery, even if deployment is manual through Cloudflare.

Relevant area:

```text
worker/worker.js
worker/README.md
```

## 7. Data Schema Compatibility

Issue:
Future edits could break existing `events.json` or `cats.json` schema assumptions.

Expected behavior:
Maintain backward compatibility unless a migration is explicitly planned.

Relevant files:

```text
data/events.json
data/cats.json
src/app.jsx
worker/worker.js
```

## 8. GitHub Pages Base Path

Issue:
Wrong Vite `base` path can break assets on GitHub Pages.

Expected behavior:
The `base` value in `vite.config.js` must match the repository name.

Current expected value:

```js
base: "/evle-p3-7f2a-cal/"
```
