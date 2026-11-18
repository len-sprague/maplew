# Maplew code map

A reference to the code inside `plew-map.html`: how the file is laid out, what state it keeps, what runs when, and which function calls which. It is written for people who want to change the tool, including people who have not read the file before.

If you want the picture rather than the detail, start with the **How it works** page (`how-it-works.html`, or `/how-it-works/` on the site). For what each control does from a user's side, see the user guide (`README-plew-map.md`).

This document names functions and state fields rather than line numbers, because line numbers move with every edit. To find anything, search the file for the name. `node tools/checks/code-health.js --inventory` prints every function with its current line.

**Kept honest by a check.** `node tools/checks/code-health.js` fails if this document names a function or state field that no longer exists, or if the code gains one that is not mentioned here. After changing the code, follow `tools/code-userguide-review.md`.

## Contents

1. [The model in one paragraph](#1-the-model-in-one-paragraph)
2. [Anatomy of the file](#2-anatomy-of-the-file)
3. [What runs when the page opens](#3-what-runs-when-the-page-opens)
4. [State](#4-state)
5. [The main call paths](#5-the-main-call-paths)
6. [From a table row to a point](#6-from-a-table-row-to-a-point)
7. [Calibration](#7-calibration)
8. [Changing the data](#8-changing-the-data)
9. [The record window, media and transcripts](#9-the-record-window-media-and-transcripts)
10. [Getting things out](#10-getting-things-out)
11. [The interface, control by control](#11-the-interface-control-by-control)
12. [Things that bite](#12-things-that-bite)
13. [The files around the tool](#13-the-files-around-the-tool)
14. [Function index](#14-function-index)
15. [Changing the code safely](#15-changing-the-code-safely)

---

## 1. The model in one paragraph

Maplew is one HTML file with no build step and no framework. All working state lives in one global object, `S`. Controls in the sidebar call a handler; the handler writes to `S` (a few display settings stay in their checkbox or slider instead); the handler then calls `renderAll()`, which rebuilds the picture from `S`: it empties the SVG overlay, draws one element per visible table row, and rebuilds the legend, the filter chips and the list of visible sidebar sections. Nothing is drawn incrementally and nothing is saved until the user presses an export button. Files never leave the browser.

```
control ──► handler ──► writes S ──► renderAll() ──► SVG points, legends, filters, sidebar sections
                                         ▲
   file drop ──► handleFiles() ──► ingestCSV() ──► classifyColumns() ─┘
```

## 2. Anatomy of the file

About 4,500 lines, in this order:

| Part | What is in it |
|------|---------------|
| `<head>` | Title, one external script (`html2canvas` from cdnjs, used only for snapshots), and all CSS in one `<style>` block. |
| `<body>` markup | The sidebar (`#sidebar`) with one `.section` per panel, the main area with the plot frame (`#plotFrame` → `#mapStage` → `#mapZoomWrap` → `#bgImage` + `#overlay`), the tooltip, the off-screen legend staging box, and one modal (`#modalOverlay`). Controls are wired with inline `onclick=` / `onchange=` attributes. |
| `<script>` | Everything else. One classic script, not a module, so every function and top-level variable is a global. That is what lets inline handlers call them, and what lets the tests read `S` from outside. |

### Script section order

The script is divided by banner comments (`// ====` lines). Search for the banner text to jump to a section. Several banners now hold more than their title says; the third column lists what else lives there.

| Banner | Holds what the title says | Also holds |
|--------|---------------------------|-----------|
| CONSTANTS & COLUMN SCHEMA | Palettes, shape list, column prefixes, name patterns, colour ramps, shape path builders | |
| STATE | The `S` literal, `MAX_UNDO`, `ZOOM_MIN` / `ZOOM_MAX`, `mkPt()` | |
| MAP ZOOM & PAN | Zoom, pan, plot size presets | Dragging the zoom bar and the on-map legend panel |
| CSV PARSING | Delimiter detection, CSV and JSON parsing | |
| COLUMN CLASSIFICATION | `classifyColumns()`, `guessLocColumns()` | Sidebar collapse, undo/redo and the change log, column roles, point clicks and comparison, setup export and import, record-window snapshots |
| PROJECTION & CALIBRATION TRANSFORMS | Mercator, affine solve, data ↔ pixel transforms | |
| MEDIA | Media type inference, URL resolution, YouTube embeds | |
| FILE LOADING | Drop-zone listeners, file → URL helpers, `handleFiles()`, `ingestCSV()` | ELAN and TextGrid parsing and the whole transcript viewer, calibration sidecars, basemap switching, blank frame, embedded calibration |
| STEP 1 — LOCATION | `onLocChange()`, `colRange()`, edge prefill, reset | |
| STEP 2 — CALIBRATION | `applyCalibration()`, three-point markers, the click listener on `#overlay` | |
| STEP 3 — ENCODINGS | Encoding dropdowns, filters, speaker filter, value → colour / size / shape | |
| RENDERING | SVG element helpers, drag-to-move | Blank rows, editor field rules, `legendCategories()` |
| PLOT TITLE & AXIS LABELS | Editable labels | `renderAll()`, `updateMeta()`, jitter, graticule, window listeners, the legend |
| TOOLTIP & MODAL | Tooltip, record editor, record viewer, keyboard listener | |
| EXPORT | CSV, snapshot PNG | `escHtml()`, `escAttr()`, `setStatus()` |
| DEMO DATASETS | The two demos | Example-page loading, and the last lines of the script (start-up) |

## 3. What runs when the page opens

The script runs top to bottom once. Most of it only defines functions. These parts execute immediately, in this order:

1. Constants and `S` are created.
2. `initZoomBarDrag`, `initLegendPanelDrag` and `initMapNavigation` run (they are immediately-invoked functions) and attach mouse and wheel listeners.
3. Listeners are attached to the drop zone (`fileDrop`), the hidden file inputs (`fileInput`, `#bgInput`, `#mediaFolderInput`, `#vizConfigInput`) and the main area. All of them end in `handleFiles()`, except `#bgInput` → `setBackgroundFromFile()` and `#vizConfigInput` → `importVisualizationConfigFromFile()`.
4. A click listener is attached to `#overlay` (placing calibration markers, adding points).
5. `resize` and `beforeunload` listeners are attached to `window`; a `keydown` listener to `document`.
6. Last lines: `restoreSectionCollapsePrefs()` reads which sidebar sections were collapsed from `localStorage` (key `SECTION_COLLAPSE_KEY`).
7. If `window.PLEW_HUGO` is set (the page was built by Hugo), the "Example datasets" and "User guide" links are shown and pointed at `window.PLEW_EXAMPLES_INDEX` and `window.PLEW_GUIDE`.
8. If `window.PLEW_EXAMPLE` is set (an example page), `showDatasetLoading()` shows the banner and `loadRemoteExample()` starts; when it finishes, `loadRemoteSetup()` runs if `window.PLEW_SETUP` is set; `hideDatasetLoading()` always runs at the end.

Nothing is drawn until a table and a background exist. Opening the file directly therefore shows the empty state and waits.

### Where the `window.PLEW_*` values come from

The Hugo layouts do not contain the tool. Each one reads `plew-map.html` from disk and inserts a `<script>` right after `<body>` that sets these globals before the tool's own script runs. See [section 13](#13-the-files-around-the-tool).

## 4. State

### 4.1 The `S` object

Declared once under the STATE banner. Grouped here by purpose.

**The table**

| Field | Holds | Written by | Notes |
|-------|-------|-----------|-------|
| `S.headers` | Column names, in file order | `ingestCSV()` | The full header text, prefix included (`dim::language`). |
| `S.data` | Array of row objects keyed by header; every value is a string | `ingestCSV()`, edits, undo/redo | Each row also has `_index`, kept equal to its array position by `reindexData()`. |
| `S.cols` | Per column: `{ role, numeric, uniq }` | `classifyColumns()` only | A cache. Must be rebuilt after any change to cells or roles. |
| `S.originalData` | Copy of the rows as loaded | `ingestCSV()` | Used only by `resetAllChanges()`. |
| `S.datasetName` | File name of the table | `handleFiles()`, demos | Basis for export file names. |
| `S.skipped` | Count of rows with non-numeric coordinates | `onLocChange()` | Shown in the meta line. |
| `S.roleOverrides` | `{ header: role }` set in Column roles | `setColumnRole()`, setup import | Wins over prefixes and name guesses. |
| `S.columnVisibility` | `{ header: false }` hides a field in the record window | `toggleColumnVisible()` | |
| `S.columnRecordOrder` | Field order in the record window | `ingestCSV()`, setup import | |

**Position**

| Field | Holds | Written by |
|-------|-------|-----------|
| `S.locX`, `S.locY` | Headers used as X and Y | `guessLocColumns()`, `onLocChange()` |
| `S.mercator` | Whether Y passes through the Mercator projection | `onLocChange()` |
| `S.calib` | `{ mode, edges:{L,R,T,B}, pts:[3], affine, placing, valid, prefilled, autoDefaults }` | See [section 7](#7-calibration) |
| `S.pendingCalib` | A calibration waiting to be applied (from the CSV row or a setup file) | `ingestCSV()`, `applyVisualizationConfig()`; consumed by `applyEmbeddedCalib()` |

**Look**

| Field | Holds | Written by |
|-------|-------|-----------|
| `S.enc` | `color:{col,type,ramp,catColors}`, `size:{col,type,minPx,maxPx,catSizes}`, `shape:{col,catShapes}` | `autoAssignEncodings()`, `onEncChange()`, `setEncType()`, the `setCat…` functions |
| `S.filters` | `{ header: { value: true/false } }` for the current categorical encoding columns only | `syncFilters()`, `setFilter()`, `setFilterAll()` |
| `S.speakerFilter` | `{ multiOnly, selected:Set }` | The speaker panel functions |
| `S.labels` | `{ title, xAxis, yAxis, mode }`, mode is `attached` or `fixed` | `commitLabelEdit()`, `onLabelsModeChange()` |

**Background and media**

| Field | Holds | Written by |
|-------|-------|-----------|
| `S.basemaps` | `[{ id, name, url, edges, mercator, imgW, imgH, ready }]`, one per dropped background image | `handleFiles()`, `setBackgroundFromFile()` |
| `S.activeBasemapId` | Which basemap is showing; `null` for a blank frame or demo canvas | `activateBasemap()`, `setBackground()` |
| `S.imageUrl`, `S.imgW`, `S.imgH`, `S.imageSet`, `S.isFrame` | The current background and its pixel size; `isFrame` is true for the generated blank frame | `activateBasemap()`, `setBackground()` |
| `S.media` | `{ filename: blob URL }` for dropped media | `handleFiles()`, cleared by `clearMediaUrls()` |
| `S.alignFiles` | `{ filename: File }` for dropped `.eaf` / `.TextGrid` | `handleFiles()` |
| `S.alignCache` | `{ filename: parsed transcript }`, including unsaved corrections | `loadAlignBundle()`, `commitAlignEdit()` |

**View**

| Field | Holds |
|-------|-------|
| `S.view` | `{ scale, tx, ty }` zoom and pan, applied as a CSS transform by `applyViewTransform()` |
| `S.stagePreset` | Plot size preset: `native`, `150`, `200`, `fit` |
| `S.zoomBarPos`, `S.legendPanelPos` | Dragged positions of the zoom bar and on-map legend; `null` means default corner |
| `S.legendPanelMinimized`, `S.legendPanelMode`, `S.legendSnapOptsOpen` | On-map legend: minimised (set only by `setMapLegendMinimized()`; saved in the setup file), edit/snapshot-preview mode, options row open |
| `S.snapLegendLayout`, `S.snapLegendTheme` | Legend placement (`side` / `bar`) and frame (`dark` / `light` / `custom`) in Snapshot PNG |
| `S._legendInteractiveHtml` | The last interactive legend HTML, reused for the on-map copy |

**Edit history and selection**

| Field | Holds |
|-------|-------|
| `S.undoStack`, `S.redoStack` | Actions of type `fields` (list of old/new values), `add` or `delete`; capped at `MAX_UNDO` |
| `S.changeLog` | Human-readable list of edits with timestamps |
| `S.compare` | `{ a, b }` row indices in the two comparison slots |
| `S.marked` | `Set` of marked row indices |
| `S.editingRow`, `S.editingIsNew` | The row open in the editor, and whether it was just created |

**Created on first use** (not in the literal): `S.stackInfo` (which rows share a location; rebuilt every redraw), `S._speakerStats` (speaker → rows; cleared every redraw), `S.wavePeaks` and `S.audioCtx` (waveform cache and audio context for the TextGrid view).

### 4.2 Other top-level variables

| Variable | Purpose |
|----------|---------|
| `COLORS`, `SHAPES`, `VIRIDIS`, `RAMPS` | Palette of 10 colours, 8 shape names, colour ramps |
| `COLUMN_PREFIXES`, `RESERVED_COLUMNS`, `DESC_LIKE`, `MEDIA_URL_PATTERNS`, `MEDIA_TYPE_HINTS` | Rules for guessing a column's role and a media column's type |
| `MIME_FROM_EXT` | File ending → MIME type, for media dropped without one |
| `CALIB_MARKER` | The text `__PLEWMAP_CALIB__` |
| `SVGNS` | SVG namespace string |
| `EXAMPLE_FETCH_CONCURRENCY` | How many example files are fetched at once (6) |
| `renderMemo` | See [section 12](#12-things-that-bite). `null` except during the point loop of `renderAll()` |
| `dragState` | The point being dragged, or `null` |
| `panState`, `mapDidPan` | Map pan in progress; whether the last mouse-down turned into a pan (suppresses the click that follows) |
| `zoomBarDrag`, `legendPanelDrag` | Panel drags in progress |
| `zoomRerenderRAF` | Pending animation-frame id for the redraw after a zoom step |

### 4.3 State that lives in the page, not in `S`

Read from the control every time it is needed:

- **Display:** `#baseSize`, `#opacity`, `#strokeChk`, `#ringChk`, `#gratChk`, `#jitterChk`, `#zoomScaleChk`, `#mapLegendChk`. Collected by `displaySnapshot()` for the setup file.
- **Edit modes:** `#dragChk` (`dragModeOn()`), `#addChk` (`addModeOn()`).
- **Size range and ramp:** `#sizeMin`, `#sizeMax`, `#rampSel`, `#rampA`, `#rampB`. `onEncChange()` copies the first three into `S.enc`; `sizeFor()` and `activeRamp()` also read the controls directly.
- **Edge values:** `#edgeL`, `#edgeR`, `#edgeT`, `#edgeB`. `applyCalibration()` copies them into `S.calib.edges`. Code that sets a calibration writes the inputs first, then calls `applyCalibration()`.
- **Snapshot options:** the four `#snapInclude…Chk` boxes and `#snapLegendBgColor`.

Outside the page: `localStorage` holds only the collapsed state of sidebar sections.

## 5. The main call paths

Indentation means "calls". Only the calls that matter for understanding are shown.

### 5.1 Files arrive: `handleFiles(fileList)`

```
handleFiles
├─ sort files by ending → tables, images, media, transcripts, *.calib.txt
├─ pickMapCsv            choose one table (csvFirstHeaders reads the first 8 KB of each)
├─ ingestCSV             (only if a table was chosen; see 5.2)
├─ clearMediaUrls        (only if a table was chosen)
├─ parseCalibText, sidecarPairsWithImage      for each sidecar
├─ images named in a table cell → media; the rest → basemaps
├─ fileToDataURL → S.basemaps → populateBasemapSelector → activateBasemap (5.3)
├─ fileToMediaUrl → S.media
├─ S.alignFiles
├─ setStatus('inputStatus', …)
├─ maybeAutoJitter       (only if a table was chosen)
└─ renderAll
```

A table without `loc::` headers is ignored when a table is already loaded (status: "Kept current CSV"). That is how a folder containing extra metadata CSVs can be dropped whole.

### 5.2 A table is parsed: `ingestCSV(text, filename)`

```
ingestCSV
├─ parseDataFile → parseCSV (detectDelimiter, splitLine) or parseJSON
├─ pull out the row whose first cell is CALIB_MARKER → S.pendingCalib
├─ reset: originalData, undo/redo, changeLog, compare, marked, roleOverrides, columnVisibility, columnRecordOrder
├─ classifyColumns
├─ guessLocColumns
├─ reset calibration: valid, affine, pts, placing; edges too unless they belong to a real image (section 7.3)
├─ reset catColors, catSizes, catShapes, filters, speakerFilter
├─ autoAssignEncodings → encCandidates
├─ populateLocSelectors → onLocChange (5.4)
├─ populateEncSelectors → syncEncControls → renderFilters → syncFilters
├─ renderColumnRoles, updateUndoUI
└─ applyEmbeddedCalib   (does nothing unless S.pendingCalib is set)
```

### 5.3 A background is shown: `activateBasemap(id)`

Returns a promise that resolves when the image has loaded.

```
activateBasemap
├─ populateBasemapSelector
└─ img.onload
   ├─ S.imgW, S.imgH, S.imageUrl, S.imageSet = true, S.isFrame = false
   ├─ applyBasemapCalib      sidecar edges → inputs, else prefillEdges; then onLocChange (5.4)
   ├─ resetMapView, setStageSize
   └─ renderAll
```

`setBackground(url, isFrame)` is the simpler path used by `useBlankFrame()` and the demos: it sets the same image fields and redraws, without a basemap entry. `switchBasemap()` calls `saveActiveBasemapCalib()` first so that edges typed for the old image are remembered on it.

### 5.4 X, Y or Mercator changes: `onLocChange(silent)`

```
onLocChange
├─ S.locX, S.locY, S.mercator ← the three controls
├─ S.skipped ← rows with non-numeric coordinates
├─ prefillEdges(columns changed?) → computeDefaultEdges → colRange
├─ applyCalibration(true) → renderAll
└─ renderAll
```

Called by the dropdowns, and also by `populateLocSelectors()`, `applyBasemapCalib()`, `applyEmbeddedCalib()`, `applyVisualizationConfig()` and `saveRecordEditor()`. It redraws twice.

### 5.5 Calibration is applied: `applyCalibration(silent)`

```
applyCalibration
├─ edges mode:  inputs → S.calib.edges; valid when all four are numbers and L≠R, T≠B
├─ affine mode: solveAffine → S.calib.affine; valid unless missing or collinear
├─ pixels mode: always valid
├─ setStatus('calibStatus', …)
└─ renderAll
```

### 5.6 The redraw: `renderAll()`

```
renderAll
├─ show / hide sidebar sections   (table loaded → image set → calibration valid)
├─ empty-state text, #mapStage and #mapHeader visibility
├─ renderLabels → syncLabelEl
├─ #overlay: set viewBox to the image size, remove everything
├─ S._speakerStats = null
├─ three-point markers (affine mode)
├─ if not plot-ready: renderLegend, updateMeta, stop
├─ drawGraticule → niceStep, dataToPixel
├─ buildStackInfo → stackKey
├─ renderMemo = { … }                       ← memo on
│  for each row:
│  ├─ rowVisible → rowPassesSpeakerFilter, encodingFilterCols, isFilterOn
│  ├─ dataToPixel → projY
│  ├─ jitterPx                 (if jitterOn and the row shares its location)
│  ├─ sizeFor → colRange or defaultSizeForCategory → legendCategories
│  ├─ shapeFor → shapeForValue → defaultShapeForCategory → legendCategories
│  ├─ shapeEl → shapePathD
│  ├─ colorFor → colRange + lerpColor + activeRamp, or legendCategories
│  └─ listeners: showTooltip / moveTooltip / hideTooltip, and startPointDrag or onPointClick
│  renderMemo = null                        ← memo off
├─ renderLegend → buildLegendHtml, renderMapLegendContent, syncLegendSnapFootUi
├─ renderFilters → syncFilters → syncCatSizes, syncCatShapes
├─ renderSpeakerFilter
└─ updateMeta
```

"Plot-ready" means: rows exist, an image is set, `S.calib.valid` is true, and both `S.locX` and `S.locY` are chosen.

### 5.7 An example page loads: `loadRemoteExample(manifestUrl)`

```
loadRemoteExample
├─ fetch the manifest; it must contain a "files" list
├─ fetch every listed file, EXAMPLE_FETCH_CONCURRENCY at a time, keeping manifest order
├─ handleFiles(files)        the same path as a manual drop (5.1)
└─ useBlankFrame             if no image arrived
then: loadRemoteSetup → applyVisualizationConfig (5.8)
```

Any failed fetch rejects the whole load; the caller shows "Could not load the example dataset."

### 5.8 A setup file is applied: `applyVisualizationConfig(cfg)`

Order matters, because each step depends on the one before:

```
applyVisualizationConfig
├─ roleOverrides, columnVisibility, columnRecordOrder → classifyColumns
├─ X, Y, Mercator controls → onLocChange
├─ S.pendingCalib = cfg.calib → applyEmbeddedCalib → setCalibMode, applyCalibration
├─ S.enc ← cfg.enc → populateEncSelectors → onEncChange
├─ S.filters, S.speakerFilter
├─ applyDisplaySnapshot → onDisplayChange
├─ S.labels
├─ switchBasemap(cfg.activeBasemapId)
└─ renderColumnRoles, renderAll
```

It does nothing if no table is loaded.

## 6. From a table row to a point

### 6.1 Column roles: `classifyColumns()`

For every header, in this order of precedence:

1. An entry in `S.roleOverrides`.
2. A prefix (`parsePrefix()` against `COLUMN_PREFIXES`): `loc`, `dim`, `med`, `desc`, `res`.
3. A media-like name (`isMediaName()`, using `MEDIA_URL_PATTERNS`) → `med`.
4. A name in `DESC_LIKE` → `desc`.
5. Otherwise `auto`.

It also records `numeric` (every non-empty value passes `Number()`) and `uniq` (sorted distinct non-empty values). `displayName()` strips the prefix for display.

### 6.2 First guesses

- **X and Y** (`guessLocColumns()`): `loc::` columns by name pattern (lon/lng/x, lat/y), then any numeric column by the same patterns, then the first two `loc::` columns, then the first two numeric columns.
- **Encodings** (`autoAssignEncodings()` over `encCandidates()`): candidates exclude X, Y, the `loc`/`med`/`desc`/`res` roles, `auto` columns whose name contains one of `RESERVED_COLUMNS`, and `auto` text columns where every value is unique (ID-like). `dim::` columns sort first. Colour gets the first text candidate, else the first numeric one. Shape gets another text candidate with at most 8 values. Size starts empty.

### 6.3 Where a row goes: `dataToPixel(x, y)`

Returns image-pixel coordinates or `null`. Y first passes through `projY()` (identity unless `S.mercator`).

| Mode | Formula |
|------|---------|
| `edges` | Linear stretch between the four edge values; top and bottom are projected too |
| `affine` | `px = a·x + b·y + c`, `py = d·x + e·y + f`, from `solveAffine()` |
| `pixels` | The values are already pixels |

`pixelToData()` is the exact inverse (with `invProjY()`), used when a point is dragged or added. `clientToPixel()` converts a mouse position to image pixels using the overlay's on-screen rectangle, so it is correct at any zoom.

The SVG overlay's `viewBox` is always `0 0 imgW imgH`. Point coordinates are therefore image pixels at every zoom level; zooming is a CSS transform on `#mapZoomWrap`.

### 6.4 Which rows are drawn: `rowVisible(row)`

A row is drawn when all of these hold:

- it passes `rowPassesSpeakerFilter()` (only relevant when `speakerColumn()` finds a speaker column; `stimulusKeyCol()` and `buildSpeakerStats()` / `getSpeakerStats()` support the "multiple stimuli" option);
- for each column in `encodingFilterCols()` (the categorical colour, size and shape columns), `isFilterOn()` is true for the row's value;
- `dataToPixel()` returns a position, and that position is within 20% of the image bounds.

Rows that share exactly the same X and Y text are grouped by `buildStackInfo()`; with **Spread stacked points** on, `jitterPx()` offsets each in a sunflower pattern. `maybeAutoJitter()` ticks that box when a newly loaded table has such rows.

### 6.5 What a point looks like

| Channel | Function | Continuous | Categorical |
|---------|----------|-----------|-------------|
| Colour | `colorFor()` | Position between `colRange()` min and max, through `lerpColor()` over `activeRamp()` | `S.enc.color.catColors[value]`, else `COLORS` by index in `legendCategories()` |
| Size | `sizeFor()` | Between Min px and Max px by position in `colRange()` | `S.enc.size.catSizes[value]`, else `defaultSizeForCategory()` (even steps in A–Z order) |
| Shape | `shapeFor()` → `shapeForValue()` | not available | `S.enc.shape.catShapes[value]`, else `defaultShapeForCategory()` (`SHAPES` by index) |

`legendCategories(col)` is the column's `uniq` values plus any value that has a custom colour, size or shape. That is what keeps an override alive when no row currently has that value.

The on-screen radius also depends on the point-size slider, ring mode, and a scale factor that cancels the zoom unless **Marker size follows map zoom** (`zoomScalesMarkers()`) is on. `shapeEl()` creates a `<circle>`, `<rect>` or `<path>` (paths from `shapePathD()`, which uses `regularPolygonPath()`, `starPath()` and `crossPath()`); `moveShapeEl()` repositions one during a drag.

## 7. Calibration

### 7.1 The three modes

Chosen with `setCalibMode()`; applied by `applyCalibration()` ([5.5](#55-calibration-is-applied-applycalibrationsilent)). Three-point mode keeps its reference points in `S.calib.pts` (made by `mkPt()`); `renderCalibPts()` draws their sidebar rows, `startPlacing()` arms the next click on the image, `setPtData()` stores typed coordinates.

### 7.2 The prefill

`computeDefaultEdges()` takes the X and Y columns' ranges plus 6% padding (top gets the larger Y). `prefillEdges(refresh)` writes that guess into the four inputs and sets `S.calib.prefilled = true`, which makes the status line yellow.

`S.calib.prefilled` is the single flag that says "these edges are only a guess". It becomes `false` when the user types an edge (`edgeEdited()`), and when edges arrive from a sidecar (`applyBasemapCalib()`), from the CSV row or a setup file (`applyEmbeddedCalib()`), or from a demo. `resetCalibration()` sets it back to `true`.

### 7.3 When edges are replaced and when they are kept

| Event | Edges that are still the prefill | Edges that were typed or loaded |
|-------|----------------------------------|---------------------------------|
| X or Y column changes | Guessed again for the new columns | Kept |
| Mercator toggled, a record saved, a basemap re-applied | Unchanged | Kept |
| A new table is loaded | Guessed again | Kept **only** when a dropped background image is showing (`S.activeBasemapId` set and not a blank frame). On a blank frame or a demo canvas they are cleared and guessed again. |
| **Reset to defaults** | Guessed again | Discarded, guessed again |
| Switching basemap | Not stored on the basemap | Stored on the basemap being left, restored when you return |

The reasoning: edge values describe the background image. They outlive a table only if there is a real image for them to describe.

### 7.4 Three carriers, applied in this order

1. **Reserved CSV row** (`CALIB_MARKER` in the first cell, JSON in the second): extracted by `ingestCSV()`, applied by `applyEmbeddedCalib()`. Carries mode, Mercator, X and Y columns, and edges or three points.
2. **Sidecar** `image.png.calib.txt` (`parseCalibText()`, matched by `sidecarPairsWithImage()`): edges and Mercator only; applied by `applyBasemapCalib()` whenever that image is activated.
3. **Setup JSON** `calib` block: applied by `applyVisualizationConfig()` through the same `applyEmbeddedCalib()`.

Later wins. In `handleFiles()` the table is ingested before the image is activated, so a sidecar overrides an embedded row's edges.

## 8. Changing the data

Every edit path does the same four things: change `S.data`, push an undo action with `pushUndoAction()`, record it with `logChange()`, and call `classifyColumns()` before `renderAll()`.

| Edit | Entry point | Undo action |
|------|-------------|------------|
| Edit fields | `openRecordEditor()` → `saveRecordEditor()` | `fields` |
| Move a point | `startPointDrag()` (drag mode on); writes X and Y on every mouse move | `fields` |
| Add a point | click on `#overlay` (add mode on) → `createBlankRow()` → editor with `isNew` | `add`, pushed on save; `cancelRecordEditor()` removes the row |
| Delete a point | `deleteEditingRow()` | `delete`, with the row and its position |

`undo()` and `redo()` replay those actions through `applyFieldChanges()`, then `reindexData()`, `classifyColumns()`, `updateUndoUI()`, `renderAll()`. `resetAllChanges()` restores `S.originalData` via `cloneRows()`. `rowByIndex()` looks a row up by `_index`.

The editor form is built from the headers: `excludeFromEditor()` drops media and reserved columns, `isLongTextColumn()` picks a `<textarea>`, `isCategoricalPickField()` adds a pick-or-type list from `categoricalFieldOptions()` (`fieldListId()` names the list; `isCategoricalEncodingCol()` says whether the column drives an encoding). X and Y are read-only there. `titleColumn()` chooses the field to focus and the default name for a new point.

Not undoable: column role changes, legend overrides, filters, calibration, labels and transcript corrections.

## 9. The record window, media and transcripts

One modal (`#modalOverlay`) shows four different things: the record (`openModal()`), the editor (`openRecordEditor()`), the comparison (`renderCompareModal()`), and a new point. `closeModal()` closes any of them and stops playback.

- **Which fields show:** `modalTableKeys()` (order from `S.columnRecordOrder`, minus hidden columns and `excludeFromModal()`). The title comes from `modalTitle()`. The tooltip uses `excludeFromTooltip()` and shows the first five remaining fields.
- **Clicks:** `onPointClick()` decides by modifier key: plain → view (slot A), Shift → edit, Alt → compare as slot B, Ctrl/Cmd → `toggleMarked()`. Slot display: `updateCompareSlotBar()`, `getCompareSlotLabel()`, `clearCompareSlot()`, `clearCompareSlots()`, `recordMediaBlock()`.
- **Media:** `getRowMedia()` collects every media column with a value; the type comes from the column name (`MEDIA_TYPE_HINTS`) or the file ending (`inferMediaTypeFromUrl()`). `resolveMediaUrl()` looks the file name up in `S.media`; `toYouTubeEmbed()` turns YouTube links into embeds. `mediaHTML()` builds the player, `switchMediaTab()` switches between several, `bindMediaPlaybackHints()` shows a hint when audio fails to play.
- **Same speaker:** when a speaker column exists, the record lists that speaker's other rows and offers `focusSpeaker()`.

### Transcripts

`fillAlignViewer(row)` runs after the record opens:

```
fillAlignViewer
├─ alignSourcesForRow   names in media columns, or the med::audio file's name with .eaf / .TextGrid
│    (alignBasename, fileStem, alignFileLookup)
├─ loadAlignBundle      read the dropped File, or fetch an http(s) URL; parse once, keep in S.alignCache
│    parseEAF (tierKind) · parseTextGrid
├─ eafChunksHTML        ELAN: one chunk per tx/ref segment with its dependent tiers (eafLineSpans)
│   textGridHTML        TextGrid: Praat-style timeline
│   alignTiersHTML      fallback: plain tiers chosen by pickAlignTiers; isAlignPause skips pauses
└─ bindAlignViewer      click-to-edit, play buttons, playhead, tier selection
     fillPraatWave → getWavePeaks → drawPraatWave
     playAlignAt · inAlignSpan · syncEafPlayButtons · followPraatPlayhead
```

`switchAlignSource()` flips between ELAN and TextGrid when both exist. Corrections: `startAlignEdit()` → `commitAlignEdit()` writes into the cached parse (and, for ELAN, into the kept XML document via `eafValueNode()`). `downloadAlignFile()` serialises with `serializeEAF()` or `serializeTextGrid()` (`praatQuote()` escapes text).

## 10. Getting things out

| Button | Function | File name | Contents |
|--------|----------|-----------|----------|
| Save to CSV | `downloadCSV()` → `generateCSV()` | `<name>-calibrated.csv` | Headers through `displayRolePrefix()`, cells through `csvCell()`, plus the calibration row from `buildCalibPayload()` when calibration is valid |
| Snapshot PNG | `downloadSnapshot()` | `<name>-snapshot.png` | Background + a serialised copy of `#overlay` on a canvas at image resolution (`loadImage()`); labels in the margins; legend via `captureLegendForSnapshot()` (`legendSnapshotScale()`, `html2canvas`) |
| Export setup | `downloadVisualizationConfig()` → `buildVisualizationConfig()` | `plew-setup-<name>.json` | See below |
| Change log | `downloadChangeLog()` | `<name>-changelog.json` | `S.changeLog` |
| 📷 Dark / Light | `snapshotModal()` | `<name>-record.png`, `-record-light.png` | The record window, via `html2canvas` |
| Download ELAN / TextGrid | `downloadAlignFile()` | The transcript's own name | The corrected transcript |

`exportBaseName()` derives `<name>` from `S.datasetName`; `triggerDownload()` clicks a temporary link.

### The setup file (version 1)

```
{ version: 1,
  locX, locY, mercator,
  calib:   { mode, mercator, locX, locY, L, R, T, B  |  pts:[{px,py,dx,dy}×3] },
  enc:     { color:{col,type,ramp,catColors}, size:{col,type,minPx,maxPx,catSizes}, shape:{col,catShapes} },
  filters: { header: { value: bool } },
  speakerFilter: { multiOnly, selected:[…] },
  display: { baseSize, opacity, stroke, zoomScale, ring, grat, jitter, drag, addPoint, mapLegend, mapLegendMinimized },
  roleOverrides, columnVisibility, columnRecordOrder,
  activeBasemapId,
  labels:  { title, xAxis, yAxis, mode } }
```

`display.mapLegendMinimized` is the on-map legend's minimised state (`S.legendPanelMinimized`), applied by `setMapLegendMinimized()`; a file without it leaves the legend as it is. Not in the file: the plot size preset, zoom and pan, panel positions, snapshot legend options, the custom ramp colours. The colour ramp name is written but not restored on import (finding B4 in `REVIEW-FINDINGS.md`).

### The legend

`buildLegendHtml({ interactive, layout, theme })` produces all variants. `renderLegend()` builds the interactive one for the sidebar and stores it; `renderMapLegendContent()` puts either that or a static snapshot preview into the on-map panel (`applyMapLegendPreviewChrome()`, `wrapLegendSection()`, `shapeGlyph()`, `shapeSelectOptions()`, `legendStroke()`, `legendShapeStroke()`, `snapLegendThemeBg()`). The options row is driven by `snapLegendOpts()`, `legendPanelMode()`, `toggleLegendSnapOpts()`, `toggleSnapBelow()`, `cycleSnapFrame()`, `toggleLegendPreview()`, `onSnapLegendOptsChange()` and `syncLegendSnapFootUi()`.

## 11. The interface, control by control

Sidebar sections in page order. "Shown when" refers to the gates in `renderAll()`.

| Section (`id`) | Shown when | Controls → handler |
|----------------|-----------|--------------------|
| Data input (`dataInputSection`) | Always | Drop zone and pickers → `handleFiles()`; Set background… → `setBackgroundFromFile()`; No background → `useBlankFrame()`; Demo buttons → `loadDemoALI()`, `loadDemoTOEIC()` (random data from `mulberry32()`) |
| Export (`exportSection`) | Plot-ready | `downloadCSV()`, `downloadSnapshot()`, `downloadVisualizationConfig()`, Import setup → `importVisualizationConfigFromFile()`; snapshot checkboxes → `onSnapshotOptsChange()` (reads nothing; values are read at export time) |
| Edit positions (`editSection`) | Plot-ready | Drag and add checkboxes → `onDisplayChange()` |
| Edits (`changesSection`) | Table loaded | `undo()`, `redo()`, `resetAllChanges()`, `downloadChangeLog()` |
| Column roles (`rolesSection`) | Table loaded | Built by `renderColumnRoles()`; role menu → `setColumnRole()`; eye → `toggleColumnVisible()` |
| Location columns (`locSection`) | Table loaded | X, Y, Mercator → `onLocChange()` |
| Background map (`basemapSection`) | Table loaded and at least one basemap | Menu → `switchBasemap()` |
| Calibration (`calibSection`) | Table loaded and image set | Mode radios → `setCalibMode()`; edge inputs → `edgeEdited()`; Apply → `applyCalibration()`; Reset → `resetCalibration()` |
| Encodings (`encSection`) | Plot-ready | Menus and size/ramp inputs → `onEncChange()`; type radios → `setEncType()`; filter chips → `setFilter()`, `setFilterAll()`; speaker panel → `onSpeakerFilterChange()`, `addSpeakerFromSelect()`, `clearSpeakerFilter()`, `setSpeakerFilter()` (helpers: `speakerSelectedSet()`, `speakerFilterPool()`, `syncSpeakerFilterFromUI()`) |
| Display (`dispSection`) | Plot-ready | Everything → `onDisplayChange()`, except the labels checkbox → `onLabelsModeChange()` |
| Legend (`legendSection`) | Plot-ready | Entry click → `toggleFilter()`; per-row inputs → `setCatColor()`, `setCatSize()`, `setCatShape()`; `resetCatSizes()`, `resetCatShapes()` |

On the plot:

| Control | Handler |
|---------|---------|
| Wheel, `+`, `−`, `⌂` | `mapZoomBy()`, `resetMapView()`; a redraw is queued by `scheduleZoomRerender()` |
| Drag the map | listeners in `initMapNavigation`, gated by `canPanMap()` |
| `1x` / `1.5x` / `2x` / `Fit` | `setStageSize()` → `updateStageSizeButtons()` |
| Zoom bar grip | `initZoomBarDrag`; `applyZoomBarPos()`, `clampZoomBarPos()`, `resetZoomBarPos()` |
| On-map legend grip and `−` | `initLegendPanelDrag`; `applyLegendPanelPos()`, `clampLegendPanelPos()`, `resetLegendPanelPos()`, `toggleMapLegend()` → `setMapLegendMinimized()` |
| Title and axis labels | `commitLabelEdit()`, `labelKeydown()`, `handleLabelPaste()` |
| Sidebar toggle, section headers | `toggleSidebar()`, `toggleSection()` (`readSectionCollapsePrefs()`, `writeSectionCollapsePrefs()`) |

Keyboard (the `keydown` listener under TOOLTIP & MODAL): `Esc` closes the modal; `B` toggles the sidebar; `Ctrl/Cmd+Z` undo; `Ctrl/Cmd+Shift+Z` redo. Ignored while typing in a field, except `Esc`.

## 12. Things that bite

1. **`S.cols` is a cache.** Change a cell or a role and forget `classifyColumns()`, and dropdowns, legends and numeric detection go stale.
2. **`_index` must equal array position.** After adding, removing or reordering rows call `reindexData()`. Inline handlers refer to rows as `S.data[<index>]`.
3. **`renderMemo` is on only inside the point loop.** While it is set, `colRange()` and `legendCategories()` return a remembered answer per column, which is what keeps a redraw linear in the number of rows. Do not write to `S.data`, `S.cols` or `S.enc` inside that loop, and do not widen the memo's scope to code that does (for example `syncFilters()`, which prunes `S.enc.shape.catShapes`).
4. **`renderAll()` is called a lot.** Many handlers call it directly and also through another handler; `onLocChange()` alone redraws twice. It is cheap enough at a few thousand rows. See P3 and P6 in `REVIEW-FINDINGS.md` before adding more calls.
5. **Edge values live in the inputs first.** To set a calibration in code: write the four inputs, set `S.calib.prefilled`, then call `applyCalibration()`. Writing `S.calib.edges` directly is overwritten at the next `applyCalibration()`.
6. **`onLocChange()` is not only a dropdown handler.** It is the general "position settings may have changed" routine, called from six places. It re-guesses edges only when a column actually changed and the edges are still the prefill.
7. **Empty cells count as 0 in ranges.** `colRange()` uses `Number()`, and `Number('')` is 0. Long-standing behaviour, kept as is.
8. **Inline handlers quote data.** Several `onclick="fn('${escAttr(value)}')"` strings break when the value contains an apostrophe (finding B2). New code should use the `data-v="…"` plus `this.dataset.v` pattern the legend inputs use.
9. **`parseCSV()` splits on line breaks before quotes** (finding B5). A quoted cell containing a newline is not supported on load.
10. **Background images are `data:` URLs on purpose.** A comment at `fileToDataURL()` explains: `blob:` URLs are blocked in some sandboxed iframes. Media uses `blob:` URLs (`fileToMediaUrl()`, typed with `mimeFromExt()`).
11. **`html2canvas` may be absent.** It is loaded from a CDN. Every use checks `typeof html2canvas === 'undefined'` and degrades with a status message.
12. **The demos set their calibration in a `setTimeout`.** They call `ingestCSV()` and `setBackground()`, then 60 ms later write edges and encodings. Code that changes load order should re-test both demos.
13. **Dataset-specific names.** `handleFiles()` prefers a basemap named `alps-default`; the speaker panel keys on columns named `speaker` / `speaker_id` and `image` / `task` / `stimulus`; transcripts are matched through the literal column `med::audio`.

## 13. The files around the tool

| Path | Role |
|------|------|
| `plew-map.html` | The tool. Works opened directly from disk. |
| `how-it-works.html` | Standalone explainer page; names functions in its internals map. |
| `hugo.toml` | Site config. `baseURL` is overridden by the deploy workflow. |
| `layouts/index.html`, `layouts/_default/plew-map.html` | Serve the tool at `/` and `/plew-map/`: read `plew-map.html`, insert the `PLEW_HUGO`, `PLEW_EXAMPLES_INDEX`, `PLEW_GUIDE` script after `<body>`, plus a script that adds the "How it works" and "Code map" links under the user-guide link. |
| `layouts/_default/example-map.html` | Same, plus `PLEW_EXAMPLE` (from the page's `manifest`) and `PLEW_SETUP` (from `setup`). |
| `layouts/_default/user-guide.html` | Renders a Markdown file from the repo root as a site page. Used for the user guide and this code map (front-matter `source`). |
| `layouts/_default/how-it-works.html` | Serves `how-it-works.html` with site links filled in. |
| `layouts/examples/list.html` | The example gallery. |
| `content/*.md`, `content/examples/*.md` | One small front-matter file per page. |
| `static/examples/<name>/` | Each example's `manifest.json` (`{"files":[…]}`), table, images, media, sidecars and optional setup JSON. |
| `.github/workflows/hugo.yml` | Builds with Hugo 0.128.0 and deploys to GitHub Pages on every push to `main`. |
| `tools/code-userguide-review.md` | The review procedure to follow after any change. |
| `tools/checks/code-health.js` | Static checks: script parses, no orphans, handlers and ids exist, this document matches the code. |
| `tools/checks/behaviour.js` | Browser tests: every example, both demos, and break tests for past fixes. |
| `tools/checks/links.js` | Link check on a built site. |
| `CLAUDE.md`, `AGENTS.md` | Tell AI coding tools to follow the review procedure. |
| `REVIEW-FINDINGS.md` | Known slow spots and bugs, with status. |

## 14. Function index

Every function in `plew-map.html`, grouped by the banner it sits under, in source order. Functions marked ▶ run by themselves when the page opens.

**CONSTANTS & COLUMN SCHEMA** — `regularPolygonPath`, `starPath`, `crossPath`, `shapePathD`, `parsePrefix`, `displayName`

**STATE** — `mkPt`

**MAP ZOOM & PAN** — `applyViewTransform`, `applyZoomBarPos`, `clampZoomBarPos`, `resetZoomBarPos`, ▶`initZoomBarDrag`, `applyLegendPanelPos`, `clampLegendPanelPos`, `resetLegendPanelPos`, `setMapLegendMinimized`, `toggleMapLegend`, ▶`initLegendPanelDrag`, `resetMapView`, `setStageSize`, `updateStageSizeButtons`, `mapZoomBy`, `scheduleZoomRerender`, `canPanMap`, ▶`initMapNavigation`

**CSV PARSING** — `detectDelimiter`, `splitLine`, `parseCSV`, `isJsonFilename`, `parseJSON`, `parseDataFile`

**COLUMN CLASSIFICATION**
- columns: `isMediaName`, `classifyColumns`, `guessLocColumns`
- sidebar: `toggleSidebar`, `readSectionCollapsePrefs`, `writeSectionCollapsePrefs`, `toggleSection`, `restoreSectionCollapsePrefs`
- undo and change log: `cloneRows`, `rowByIndex`, `pushUndoAction`, `applyFieldChanges`, `undo`, `redo`, `updateUndoUI`, `logChange`, `resetAllChanges`, `downloadChangeLog`
- column roles: `renderColumnRoles`, `setColumnRole`, `toggleColumnVisible`, `displayRolePrefix`
- clicks and comparison: `onPointClick`, `toggleMarked`, `getCompareSlotLabel`, `updateCompareSlotBar`, `clearCompareSlot`, `clearCompareSlots`, `modalTableKeys`, `renderCompareModal`, `recordMediaBlock`
- setup file: `displaySnapshot`, `applyDisplaySnapshot`, `buildVisualizationConfig`, `downloadVisualizationConfig`, `importVisualizationConfigFromFile`, `applyVisualizationConfig`
- `snapshotModal`

**PROJECTION & CALIBRATION TRANSFORMS** — `projY`, `solveAffine`, `dataToPixel`, `invProjY`, `pixelToData`

**MEDIA** — `inferMediaTypeFromUrl`, `resolveMediaUrl`, `toYouTubeEmbed`, `getRowMedia`

**FILE LOADING**
- file helpers: `fileToDataURL`, `mimeFromExt`, `clearMediaUrls`, `fileToMediaUrl`, `csvFirstHeaders`, `pickMapCsv`
- transcripts, parsing and display: `parseEAF`, `parseTextGrid`, `textGridHTML`, `drawPraatWave`, `getWavePeaks`, `fillPraatWave`, `alignFileLookup`, `fileStem`, `alignBasename`, `alignSourcesForRow`, `loadAlignBundle`, `tierKind`, `pickAlignTiers`, `isAlignPause`, `alignTiersHTML`, `eafLineSpans`, `eafChunksHTML`
- transcripts, playback and editing: `playAlignAt`, `followPraatPlayhead`, `inAlignSpan`, `syncEafPlayButtons`, `bindAlignViewer`, `fillAlignViewer`, `switchAlignSource`, `eafValueNode`, `startAlignEdit`, `commitAlignEdit`, `praatQuote`, `serializeTextGrid`, `serializeEAF`, `downloadAlignFile`
- sidecars and basemaps: `parseCalibText`, `calibKeyForImageName`, `sidecarPairsWithImage`, `saveActiveBasemapCalib`, `populateBasemapSelector`, `applyBasemapCalib`, `switchBasemap`, `activateBasemap`
- intake: `handleFiles`, `setBackgroundFromFile`, `setBackground`, `useBlankFrame`, `ingestCSV`, `applyEmbeddedCalib`

**STEP 1 — LOCATION** — `populateLocSelectors`, `onLocChange`, `colRange`, `computeDefaultEdges`, `prefillEdges`, `edgeEdited`, `resetCalibration`, `round4`

**STEP 2 — CALIBRATION** — `setCalibMode`, `applyCalibration`, `numOrNull`, `renderCalibPts`, `startPlacing`, `setPtData`

**STEP 3 — ENCODINGS**
- dropdowns: `encCandidates`, `autoAssignEncodings`, `populateEncSelectors`, `onEncChange`, `setEncType`, `syncEncControls`
- filters: `encodingFilterCols`, `syncFilters`, `syncCatSizes`, `syncCatShapes`, `isFilterOn`, `rowVisible`, `setFilter`, `toggleFilter`, `setFilterAll`, `renderFilters`
- speaker panel: `speakerColumn`, `stimulusKeyCol`, `buildSpeakerStats`, `getSpeakerStats`, `speakerSelectedSet`, `speakerFilterPool`, `syncSpeakerFilterFromUI`, `onSpeakerFilterChange`, `addSpeakerFromSelect`, `clearSpeakerFilter`, `setSpeakerFilter`, `focusSpeaker`, `rowPassesSpeakerFilter`, `renderSpeakerFilter`
- value → visual: `hexToRgb`, `lerpColor`, `activeRamp`, `colorFor`, `defaultSizeForCategory`, `sizeFor`, `setCatSize`, `resetCatSizes`, `defaultShapeForCategory`, `shapeForValue`, `shapeFor`, `shapeSelectOptions`, `setCatShape`, `resetCatShapes`, `setCatColor`

**RENDERING**
- SVG and mouse: `shapeEl`, `moveShapeEl`, `clientToPixel`, `dragModeOn`, `addModeOn`, `startPointDrag`
- rows and editor fields: `reindexData`, `titleColumn`, `createBlankRow`, `isLongTextColumn`, `excludeFromEditor`, `isCategoricalEncodingCol`, `legendCategories`, `computeLegendCategories`, `categoricalFieldOptions`, `isCategoricalPickField`, `fieldListId`

**PLOT TITLE & AXIS LABELS**
- labels: `onLabelsModeChange`, `syncLabelEl`, `renderLabels`, `commitLabelEdit`, `labelKeydown`, `handleLabelPaste`
- redraw: `renderAll`, `updateMeta`, `onDisplayChange`
- stacked points: `stackKey`, `buildStackInfo`, `jitterPx`, `jitterOn`, `zoomScalesMarkers`, `maybeAutoJitter`
- graticule: `niceStep`, `drawGraticule`
- legend: `legendStroke`, `legendShapeStroke`, `snapLegendThemeBg`, `snapLegendOpts`, `onSnapLegendOptsChange`, `legendPanelMode`, `toggleLegendSnapOpts`, `toggleSnapBelow`, `cycleSnapFrame`, `toggleLegendPreview`, `syncLegendSnapFootUi`, `applyMapLegendPreviewChrome`, `renderMapLegendContent`, `wrapLegendSection`, `buildLegendHtml`, `renderLegend`, `shapeGlyph`

**TOOLTIP & MODAL** — `excludeFromTooltip`, `excludeFromModal`, `modalTitle`, `showTooltip`, `moveTooltip`, `hideTooltip`, `openRecordEditor`, `saveRecordEditor`, `cancelRecordEditor`, `deleteEditingRow`, `openModal`, `mediaHTML`, `bindMediaPlaybackHints`, `switchMediaTab`, `closeModal`

**EXPORT** — `csvCell`, `buildCalibPayload`, `generateCSV`, `exportBaseName`, `triggerDownload`, `downloadCSV`, `onSnapshotOptsChange`, `loadImage`, `legendSnapshotScale`, `captureLegendForSnapshot`, `downloadSnapshot`, `escHtml`, `escAttr`, `setStatus`

**DEMO DATASETS** — `loadDemoALI`, `loadDemoTOEIC`, `mulberry32`, `showDatasetLoading`, `hideDatasetLoading`, `loadRemoteExample`, `loadRemoteSetup`

## 15. Changing the code safely

1. Read the section of this map that covers what you are changing, and [Things that bite](#12-things-that-bite).
2. Before editing, save a baseline: `node tools/checks/behaviour.js > before.txt`.
3. Make the change. If you add a function, a field of `S` or a top-level variable, add it to this map in the same commit; the check in step 4 fails otherwise.
4. Run `node tools/checks/code-health.js` and `node tools/checks/behaviour.js > after.txt`, then `diff before.txt after.txt`. Only the lines your change was meant to alter should differ.
5. Follow `tools/code-userguide-review.md` to bring this map, the user guide, the How it works page and `REVIEW-FINDINGS.md` up to date, then record the stamp below.

### Verification stamp

The documents were last checked against this exact version of the tool. The hash is the output of `git hash-object plew-map.html`; `node tools/checks/code-health.js` fails when it no longer matches.

| File | Lines | Blob hash | Verified |
|------|------:|-----------|----------|
| `plew-map.html` | 4513 | `bc57b6a493d6988d7791199dd4b2a9e181e40180` | 2026-11-18 |
