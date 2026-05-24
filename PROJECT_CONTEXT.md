# EVLE Phase 3 Production Calendar - Project Context

## Purpose

This project maintains the EVLE Phase 3 Production Calendar, a browser-based milestone and scheduling calendar used to track project events, freezes, workshops, holidays, and related production schedule items.

## Architecture

The current production target is:

- Vite + React frontend
- GitHub Pages static hosting
- Cloudflare Worker API backend
- GitHub repository JSON files as persistent data storage

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
│   └── worker.js
├── index.html
├── package.json
├── vite.config.js
├── README.md
└── .gitignore