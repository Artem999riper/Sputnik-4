# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

```bash
npm install
node server.js
# Runs on http://localhost:3000
```

No build step. On first run, `survey.db` (SQLite) and `public/uploads/` are created automatically.

**Optional dependencies for DEM terrain processing:**
- GDAL/OSGeo4W (`C:\OSGeo4W\bin` on Windows, `/usr/bin` on Linux)
- Python 3 with `osgeo` bindings (for `dem_export.py`)

`dem-processor.js` fails gracefully if GDAL is absent; all other features work without it.

## Architecture

**Backend — Node.js/Express**

- `server.js` — app entry point, Express setup, auto-backup scheduler
- `database.js` — SQLite schema definitions and `wrap()`/transaction helpers
- `routes/` — one file per domain: `sites.js`, `bases.js`, `pgk.js`, `cargo.js`, `tasks.js`, `misc.js`, `realtime.js`
- `dem-processor.js` — GDAL orchestration for ArcticDEM STAC data → GeoTIFF → DXF pipeline
- `satellite-fetcher.js` — downloads Esri World Imagery tiles and assembles JPEG+JGW worldfile
- `dxf-writer.js` — minimal DXF R12 format builder for CAD export

**Frontend — Vanilla JS SPA**

- `public/index.html` — single HTML entry point with all modal scaffolding
- `public/js/globals.js` — shared mutable state (`window.sites`, `window.bases`, etc.)
- `public/js/map.js` — Leaflet integration, base/overlay layer management
- `public/js/panel.js` — right-side detail panel with tab switching (906 lines, central UI hub)
- `public/js/pgk.js` — largest module: personnel, machinery, equipment, materials (ПГК)
- `public/js/ui.js` — modal dialogs, notifications, toast system

No framework, no bundler — raw DOM manipulation via `getElementById`/`innerHTML`.

**Real-time updates**

SSE endpoint `/api/events` broadcasts changes to all connected clients. After any write operation, the server calls `broadcast()` from `realtime.js` so all tabs stay in sync.

**Undo pattern**

DELETE routes return the deleted row as JSON. The client shows a 10-second toast; if the user clicks undo, the client POSTs to `/api/restore` with the saved row data.

## Database

SQLite (`survey.db`, WAL mode). No ORM — raw prepared statements via `better-sqlite3`.

Key tables: `sites`, `bases`, `site_bases`, `volumes`, `vol_progress`, `pgk_workers`, `pgk_machinery`, `pgk_equipment`, `materials`, `cargo_orders`, `kameral_reports`, `kml_layers`, `activity_log`, `app_settings`.

Settings (backup interval, max backups) are stored as key-value rows in `app_settings`.

## Conventions

- Source files contain heavy Cyrillic comments and some Cyrillic variable/table names — this is intentional (Russian-language project).
- Frontend state lives on `window.*` globals; components read/write these directly.
- API body size limits: 8 MB global, 50 MB for `/api/layers` and `/api/sites` (GeoJSON uploads).
- File uploads (photos) via `multer`, max 15 MB, stored in `public/uploads/`.
