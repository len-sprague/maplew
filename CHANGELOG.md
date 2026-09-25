# Changelog

All notable changes to **plew-map** in this repo. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — `fs-maplew` branch

Work-in-progress on `plew-map.html`; not yet committed or merged to `main`.

### Added

#### Sidebar & plot viewing usability
- **Snapshot PNG** export now has independent **Title / X-axis label / Y-axis label / Legend** checkboxes (Export section), all on by default. Label inclusion no longer depends on the attached/fixed label mode — labels are drawn into the exported canvas margins either way. The on-map legend (a separate HTML overlay, not part of the SVG points layer) is now rasterized via `html2canvas` and composited onto the exported PNG at its current on-screen position/state, with a graceful fallback (legend skipped, status warning shown) if `html2canvas` fails to load.
- **Plot display size** presets (1x / 1.5x / 2x / Fit) in the map's zoom bar — resizes the plot box on screen independently of the background image's native resolution and of the existing pan/zoom, useful on large monitors where a low-resolution basemap used to render small. "Fit" tracks window resizes.
- Sidebar sections are now collapsible (click a header to toggle, chevron indicates state); the open/closed state persists across reloads. Data input, Export, Edit positions, Edits, Column roles, and Calibration default open; Location columns, Background map, Encodings, Display, and Legend default collapsed.
- Encodings' **Filter categories** and **Explore speaker** blocks are now boxed as distinct sub-panels instead of a plain divider.

#### PLeW editor features on the map
- Undo / redo and a change log for moves, edits, adds, and deletes.
- Compare two records (Alt+click for slot B). Ctrl/Cmd+click marks points.
- Column roles: retag and hide fields; prefixes follow on CSV export.
- Visualization setup JSON (encodings, filters, calibration, roles).
- Record-window Dark / Light PNG snapshots.
- **B** hides the sidebar. JSON/JSONL upload. **Load media files…** as a second step (mixed drops unchanged).

#### Drag-to-reposition points
- New **Edit positions** sidebar section (visible after valid calibration).
- **Drag points to move them** checkbox — drag any plotted point on the map; location columns update live.
- Live coordinate readout in the edit status panel while dragging.
- **Save to CSV** persists repositioned coordinates.
- Inverse calibration transforms: `pixelToData()` and `invProjY()` for edges, three-point affine, and pixels modes (respects Web Mercator when enabled).
- Visual feedback: grab/grabbing cursors, dimmed non-dragged points, ring markers move with dragged points.

#### Click-to-add and annotate points
- **Click map to add a new point** checkbox — click empty map area to place a new record at that location.
- Crosshair cursor when add mode is on.
- Opens an **Edit record** / **New point** form immediately after placement.
- Auto-generated default name (`Point 1`, `Point 2`, …).
- **Delete** button in the editor for existing points.
- Cancel on a new point removes it from the dataset.

#### Record editor modal
- Click a point (without drag mode) → editable form for all non-reserved columns.
- **Shift+click** a point → read-only view modal (with **Edit** button).
- In drag mode, **Shift+click** without moving opens the editor.
- Location columns shown read-only (set by map click or drag).
- Long-text / description columns use textareas.
- Closing the modal on an unsaved new point discards it.

#### Editable plot title & axis labels
- Click the title or an axis label directly on the plot to edit it in place (plain-text `contenteditable`; Enter commits, Esc reverts).
- **Title & axis labels pan/zoom with the map** toggle in Display, on by default: labels sit on the map itself and move/scale with it as you zoom and pan (can go out of view). Off pins them around the plot frame instead, always visible at a constant size.
- Persisted through **Export setup** / **Import setup** JSON (`S.labels`).
- **Snapshot PNG** draws fixed-mode labels into expanded canvas margins; map-attached labels aren't captured in the export yet (screenshot the current view instead).

#### Categorical field picker
- Columns with known categories (e.g. `dim::type`: food, building, street) show a **pick or type new** control in the editor.
- Uses an HTML `<datalist>` — choose an existing value or type a new one.
- Applies to categorical encoding columns (color, size, shape) and any non-numeric column that already has category values in the data.
- New categories update the **legend** automatically on save (new color swatch, shape entry, etc.).
- `legendCategories()` helper keeps legend, color assignment, and shape assignment in sync.

### Changed
- Calibration success messages now mention **Edit positions** for fine-tuning.
- Point click behavior: default opens editor; Shift+click opens read-only modal.
- Categorical color/shape/size encoding uses `legendCategories()` instead of raw `uniq` lists, so custom legend colors and newly typed categories stay consistent.
- View modal includes an **Edit** button.

### Test data & examples (local, untracked)
- `neighborhood.png` — Mapbox-style screenshot of Cologne Niehl (Industriestraße area).
- `neighborhood.csv` — starter rows with approximate lon/lat for buildings, bakery, street.
- `neighborhood-calibrated.csv` — exported dataset with embedded `__PLEWMAP_CALIB__` row after manual calibration/drag adjustments.
- `iris.csv` — simple non-geographic test data.
- `demo-atlas-map.png` — atlas map image for Iran demo workflow.

---

## [0.1.0] — 2026-08-13

Initial public repo on `main` (`github.com/fsame/plew-map`).

### Added
- Single-file **plew-map** app: CSV + background image plotting with calibration and encodings.
- Location columns (Step 1), calibration modes — image edges, three-point affine, pixels (Step 2), color/size/shape encodings (Step 3).
- Embedded calibration via `__PLEWMAP_CALIB__` CSV row; **Save to CSV** and **Snapshot PNG** export.
- Record modal with media (audio, video, image, YouTube).
- Demo loaders: atlas map and TOEIC scatter.
- Documentation: `README-plew-map.md`, design and test-data guides.
- `.gitignore` (excludes nested `PLeW-NLG/` repo).

### Known limitations (documented in README at this version)
- No in-app point editing, undo, or change log.
- Background image not embedded in CSV export.
- Exactly three calibration reference points (no least-squares fit).

---

## Development notes

| Branch | Purpose |
|--------|---------|
| `main` | Initial prototype (v0.1.0) |
| `fs-maplew` | Image + annotation workflow improvements (this changelog's Unreleased section) |

When merging `fs-maplew`, move the Unreleased items into a dated release section and update `README-plew-map.md` limitations accordingly.
