# Maplew review: speedups, streamlining and bugs

A read-through of the whole repository (all 4,458 lines of `plew-map.html`, the Hugo layouts, the example manifests and every doc), with the suspected slow spots measured in headless Chromium. **Nothing in `plew-map.html` was changed by this review.** Everything below is a proposal to pick from.

For a picture of how the pieces fit together, see the [How it works](how-it-works.html) page (also on the site at `/how-it-works/`) or the diagrams in [README.md](README.md#how-it-works).

## Summary

| # | Finding | Kind | Effect today | Effort |
|---|---------|------|--------------|--------|
| [P1](#p1-continuous-colour-or-size-makes-every-redraw-quadratic) | Continuous colour or size rescans the whole table once per point | Speed | 5,000 rows: 5 s per redraw. 20,000 rows: 73 s | Small |
| [B1](#b1-a-second-dataset-inherits-the-first-ones-edge-values) | Loading a second dataset, or changing the X or Y column, keeps the old calibration edges | Bug | New data plots with 0 points visible | Small |
| [P2](#p2-example-pages-download-every-file-one-at-a-time-before-showing-anything) | Example pages fetch every media file, one at a time, before the plot appears | Speed | ISAPh: 108 requests, 16.7 MB before first paint | Medium |
| [B2](#b2-apostrophes-in-a-category-or-column-name-break-filters) | An apostrophe in a category value breaks its filter chip and legend click | Bug | `Valle d'Aosta` cannot be filtered | Small |
| [B3](#b3-tables-above-roughly-100000-rows-fail-to-load) | Tables above roughly 100,000 rows throw on load | Bug | 200,000 rows: `RangeError`, nothing loads | Small |
| [P3](#p3-every-change-rebuilds-everything) | Every change rebuilds every point, both legends and both filter panels | Speed | Linear cost per click, wheel step and slider tick | Medium |
| [B4](#b4-the-colour-ramp-does-not-survive-export-setup--import-setup) | Colour ramp is lost on Export setup → Import setup | Bug | Imported view falls back to the dropdown's current ramp | Small |
| [B5](#b5-a-line-break-inside-a-cell-corrupts-the-next-save--reload) | A line break typed into a long-text field corrupts the next save and reload | Bug | One record becomes two broken rows | Medium |
| [P4](#p4-media-and-basemaps-are-copied-in-memory-on-load) | Media and basemap files are copied in memory when loaded | Speed | Roughly double the memory per media file | Small |
| [P5](#p5-the-only-external-script-blocks-the-first-paint) | `html2canvas` is loaded as a blocking script in `<head>` | Speed | Slow or offline network delays the whole page | Small |
| [P6](#p6-loading-triggers-many-redundant-redraws) | Loading an example runs the full redraw 13 times | Speed | Invisible at 1,000 rows, multiplies P1 and P3 | Medium |
| [P7](#p7-transcript-playback-touches-every-segment-on-every-frame) | Transcript playback re-checks every segment on every animation frame | Speed | 1,268 class toggles per frame on the DoReCo sample | Small |
| [S1–S8](#streamlining) | Duplicated or dataset-specific code, three calibration carriers, no-op handlers | Streamlining | Harder to maintain and to explain | Varies |
| [D1–D9](#documentation-mismatches) | Docs that disagree with the code | Docs | Fixed in this PR where the code settles it, listed where it needs your call | Done or flagged |

Suggested order: P1 and B1 first (large effect, a few lines each), then B2 and B3, then P2.

## How the numbers were taken

Headless Chromium against `plew-map.html` served from the repo root, on the session's container. Timings are single runs and will differ on other machines; the ratios between rows are what matter. Synthetic tables have three numeric columns and one 8-value category column, plotted on the built-in blank frame.

Time for one `renderAll()` call:

| Rows | No encodings | Categorical colour + shape | Continuous colour + size |
|-----:|-------------:|---------------------------:|-------------------------:|
| 1,000 | 17 ms | 31 ms | 197 ms |
| 5,000 | 68 ms | 73 ms | 5,114 ms |
| 20,000 | 347 ms | 341 ms | 72,828 ms |

Files an example page fetches before the plot appears (sizes from disk):

| Example | Files in manifest | Size | `renderAll()` calls during load |
|---------|------------------:|-----:|--------------------------------:|
| ISAPh PwPD (either page) | 108 | 16.7 MB | 13 |
| DoReCo Africa | 9 | 12.2 MB | 6 |
| ALLSSTAR | 7 | 4.0 MB | not measured |
| AlpiLinK | 16 | 2.8 MB | 6 |
| Ecological World Englishes | 2 | 0.6 MB | not measured |
| Bozen-Bolzano | 1 | 0.1 MB | 13 |

Network time was not measured: the test server was local, so latency was near zero. On a real connection the request count and megabytes above are what a visitor waits for.

## Speed

### P1. Continuous colour or size makes every redraw quadratic

`colorFor(row)` and `sizeFor(row)` are called once per point. In continuous mode each call runs `colRange(col)`, which converts and scans the entire column to find its min and max. So a redraw of *n* rows does *n* full scans per channel.

```js
function colorFor(row){
  ...
  if (S.enc.color.type==='continuous'){
    const [mn,mx] = colRange(col);          // scans all rows, for every row
```

The categorical path has the same shape on a smaller scale: `colorFor`, `shapeFor` and `defaultSizeForCategory` each call `legendCategories(col)`, which builds a `Set` and sorts it, once per row.

**Fix.** Compute the range and the category list once at the top of `renderAll()` (or cache them on `S.cols[h]` inside `classifyColumns()`, which already walks every column) and pass them in. The table above suggests continuous mode would then cost about the same as the other two columns.

Related per-row work inside the same loop that can move out of it: `sizeFor` reads three DOM inputs per row; `dragModeOn()` and `jitterOn()` read a checkbox per row; `rowPassesSpeakerFilter` re-finds the speaker column per row; `shapeFor(row)` is called twice per point when drag mode is on.

### P2. Example pages download every file one at a time before showing anything

`loadRemoteExample()` walks the manifest with `await fetch()` inside a `for` loop, so files arrive strictly one after another, and `handleFiles()` runs only after the last one. The ISAPh example fetches 107 WAV and PNG files a visitor may never open before the 356 points appear.

Two fixes, independent of each other:

1. **Fetch in parallel.** Replace the loop with `Promise.all` over a small pool (4–6 at a time). No behaviour change.
2. **Fetch media on demand.** Fetch only the table, basemap images and `.calib.txt` sidecars up front. For everything else, record `S.media[name] = base + name` so `resolveMediaUrl()` hands the browser a plain URL, and the audio, image or transcript loads when its record is opened. The plot then appears after the CSV and basemap alone. `loadAlignBundle()` already knows how to fetch an ELAN or TextGrid file by URL.

Fix 2 changes what the manifest means (a list of files that exist, rather than files to preload), so it deserves its own PR and a line in the README.

### P3. Every change rebuilds everything

`renderAll()` is the single redraw path. It clears the SVG and recreates every point with three or four event listeners each, then rebuilds the sidebar legend, the on-map legend, the filter chips and the speaker panel. It runs for every change, including ones that touch one element:

| Action | What actually changed | What gets rebuilt |
|--------|-----------------------|-------------------|
| Click a point | One point gains the `compare-a` outline | Everything |
| Ctrl/Cmd+click to mark | One point gains a dashed outline | Everything |
| Mouse-wheel zoom (default fixed-size markers) | Marker radius | Everything, once per frame |
| Drag the opacity or point-size slider | One attribute on each point | Everything, once per input event |
| Window resize | Layout | Everything, once per resize event |

At 1,000 rows this is 14–24 ms per action and unnoticeable. It grows linearly, and it multiplies P1.

**Options, smallest first.**
- Update classes in place for click, mark and compare instead of calling `renderAll()`.
- Debounce the resize handler the way zoom already is (`scheduleZoomRerender`).
- Attach tooltip and click handlers once on the `<svg>` (event delegation, looking up the row from a `data-i` attribute) instead of per point.
- Split `renderAll()` into `renderPoints()` and `renderPanels()` so a zoom step does not rebuild legends and filters.
- For fixed-size markers on zoom, set the radius through a CSS variable or `vector-effect` rather than recreating elements.

Also inside the panels: `buildLegendHtml()` calls `legendCategories(cc)` again for every category it loops over, and `syncFilters()` does the same inside `includes()`. Both are harmless at 10 categories and quadratic at 500. `renderFilters()` runs twice per encoding change (once from `syncEncControls()`, once from `renderAll()`).

### P4. Media and basemaps are copied in memory on load

- `fileToMediaUrl()` reads the whole file into an `ArrayBuffer` and wraps it in a new `Blob` just to attach a MIME type. `f.slice(0, f.size, mime)` gives the same typed blob without copying. Files from example pages always take the copying path, because `new File([blob], name)` is created without a type.
- Every basemap in a drop is converted to a base64 `data:` URL up front, including the ones not shown. AlpiLinK's five basemaps hold 1.8 million characters; DoReCo's one holds 2.0 million. The comment in the code explains why (`blob:` URLs are blocked in some sandboxed iframes). A middle path is to convert a basemap only when it is first selected.
- `downloadCSV()` builds a `data:` URL with `encodeURIComponent`, which roughly triples the text and can exceed browser URL limits for large tables. The setup JSON and change-log downloads already use a `Blob` URL; the CSV can do the same.
- `triggerDownload(URL.createObjectURL(blob), …)` never revokes the URL. Small, but it accumulates across exports.

### P5. The only external script blocks the first paint

`<script src="…/html2canvas.min.js">` sits in `<head>` without `defer`, so the browser waits for the CDN before rendering anything. It is used only for the legend in Snapshot PNG and for the record-window snapshots. Add `defer`, or inject the script the first time one of those buttons is pressed. The code already handles the library being absent.

This is also the one thing that stops the file from working fully offline; worth a line in the user guide either way (added in this PR).

### P6. Loading triggers many redundant redraws

Several handlers both call `renderAll()` themselves and call another handler that does too. `onLocChange()` always renders twice (once through `applyCalibration()`, once directly). `ingestCSV()` reaches `renderAll()` through `populateLocSelectors()` and again through `applyEmbeddedCalib()`. `applyVisualizationConfig()` chains `onLocChange` → `applyEmbeddedCalib` → `onEncChange` → `applyDisplaySnapshot` → `renderAll`, each of which redraws.

Measured: 13 full redraws while loading an example that has a setup file, 6 without one.

**Fix.** A one-line guard covers all of it: make `renderAll()` schedule itself with `requestAnimationFrame` (the pattern `scheduleZoomRerender()` already uses) so any number of calls in one tick produce one redraw. The few places that read the DOM straight after rendering (Snapshot PNG clones the overlay) would call a synchronous `renderNow()`.

### P7. Transcript playback touches every segment on every frame

In `bindAlignViewer()`, the `onTime` callback loops over every `.align-seg` element toggling a class, then `syncEafPlayButtons()` loops over every play button. It runs on both `timeupdate` and a `requestAnimationFrame` loop while audio plays. The DoReCo Beja sample has 1,268 segments.

**Fix.** Segments are sorted by start time. Keep the index of the current one and only look at its neighbours, or binary-search on seek.

`eafChunksHTML()` filters the full segment list once per chunk (and recomputes `of('tx')` inside the loop). It measured 2.7 ms on the 868-segment sample, so it is not a problem at this size; noting it for hour-long recordings.

## Bugs found along the way

Each of these was reproduced in the browser.

### B1. A second dataset inherits the first one's edge values

`ingestCSV()` resets `S.calib.valid`, `affine`, `pts` and `placing`, but not `S.calib.edges` or the four edge inputs. `prefillEdges()` then sees `E.L !== null` and declines to overwrite ("don't clobber user input").

Reproduce: load a CSV with x, y in 1–4 and press **No background**; then load a CSV with x, y in 1000–4000. The edges stay at `[0.88, 3.12] × [1.88, 4.12]`, zero points are drawn, and the status still says *"Prefilled from the data range (approximate)"*.

The same guard bites within one dataset: once the first calibration has run, `E.L` is never null again, so choosing a different X or Y column in Step 1 also keeps the old edges. Reproduced: switching X from a 1–3 column to a 1000–3000 column drops the plot from 2 points to 0.

**Fix.** Let `prefillEdges()` overwrite whenever `S.calib.prefilled` is still true (the user has not typed a value), and in `ingestCSV()` reset `S.calib.edges` to nulls and `S.calib.prefilled` to true before `populateLocSelectors()`. **Reset to defaults** is the current workaround (noted in the user guide in this PR).

### B2. Apostrophes in a category or column name break filters

Several inline handlers build a JavaScript string from data:

```js
onchange="setFilter('${escAttr(col)}','${escAttr(v)}',this.checked)"
```

`escAttr` turns `'` into `&#39;`, but the HTML parser turns it back into `'` before the handler is compiled, so `Valle d'Aosta` yields `setFilter('dim::region','Valle d'Aosta',…)` and a syntax error. The checkbox ticks but nothing is filtered.

Affected: filter chips, legend click-to-filter, All/None buttons, column-role eye and dropdown, speaker chips, "Show all on map", transcript Download.

The legend's colour, size and shape inputs already use the safe pattern (`data-v="…"` plus `this.dataset.v`). Applying it everywhere fixes the bug and also closes the door on a CSV cell injecting script into a hosted example page.

### B3. Tables above roughly 100,000 rows fail to load

`colRange()` uses `Math.min(...nums)`. Spreading a very large array overflows the call stack. A 200,000-row table throws `RangeError: Maximum call stack size exceeded` during `ingestCSV()` and nothing appears.

**Fix.** A plain loop for min and max. This is the same function as P1, so one change addresses both.

### B4. The colour ramp does not survive Export setup → Import setup

`applyVisualizationConfig()` copies `cfg.enc` into `S.enc` and then calls `onEncChange()`, which immediately overwrites `S.enc.color.ramp` with whatever the ramp dropdown currently shows. The dropdown is never set from the config. Exported `"greens"`, imported, result `"viridis"`.

The two custom-ramp colour pickers (`rampA`, `rampB`) are not in the export at all.

**Fix.** Set `rampSel.value` from `cfg.enc.color.ramp` before `onEncChange()`, and add the two custom colours to `buildVisualizationConfig()`.

None of the four setup files shipped in `static/examples/` uses a non-default ramp, so no current example is affected.

### B5. A line break inside a cell corrupts the next save and reload

`parseCSV()` splits the text on newlines before it looks at quotes. `generateCSV()` correctly quotes cells that contain newlines. The record editor uses a `<textarea>` for long-text columns, so pressing Enter in a note, saving to CSV and reloading splits that record in two.

Reproduced: 2 rows in, 3 rows out, the middle one named `line two`.

**Fix.** Make the splitter quote-aware across lines (walk the text once, tracking the in-quotes state), or replace line breaks with spaces in `saveRecordEditor()` as a stopgap.

### Smaller observations (not reproduced as failures)

- The two demo loaders set their calibration inside `setTimeout(…, 60)` while the background image loads asynchronously. It works because either order ends in a valid state, but it depends on timing rather than sequence.
- `rowByIndex(i)` uses `S.data.find()`. After `reindexData()` the index always equals the array position, so `S.data[i]` is equivalent.
- Snapshot PNG clones the overlay as currently drawn. With the default fixed-size markers, radii are divided by the zoom level, so a snapshot taken while zoomed in to 400% has markers a quarter of the size of one taken at 100%, although both show the whole image. Read from the code, not measured.
- Decimal commas (`3,14`), common in spreadsheets saved with Italian or German regional settings, are read as text, so such a column cannot be chosen as a coordinate or continuous encoding. Now noted in the user guide.

## Streamlining

**S1. Two copies of the drag-a-panel code.** The zoom bar and the on-map legend each have their own `apply…Pos`, `clamp…Pos`, `reset…Pos` and `init…Drag` (about 70 lines each, identical apart from names). One `makeDraggable(panelEl, gripEl, stateKey)` replaces both.

**S2. Three places a calibration can live.** The reserved `__PLEWMAP_CALIB__` CSV row, a `<image>.calib.txt` sidecar, and the `calib` block of a setup JSON. They are applied in that order, so each later one wins; switching basemap afterwards re-applies that basemap's sidecar. Each has a reason to exist (self-calibrating CSV, several basemaps for one table, a curated view), but the precedence is not written anywhere a user would find it. It is now in the How it works page. If you want fewer, the sidecar is the only one the app cannot write itself.

**S3. Dataset-specific names in general code.**
- `handleFiles()` prefers a basemap named `alps-default`.
- `speakerColumn()` and `stimulusKeyCol()` switch on the whole "Explore speaker" panel when a column is called `speaker`, `speaker_id`, `image`, `task` or `stimulus`.
- `alignSourcesForRow()` looks for transcripts next to the literal column `med::audio`.

These work for the shipped examples and are invisible to anyone else. Options: document the trigger names (done in the user guide in this PR), or make them choices in Column roles and the manifest (`"defaultBasemap": "…"`).

**S4. Leftovers.** `onSnapshotOptsChange()` is an empty function called by four checkboxes. `shapePathD()` has the triangle path twice (once named, once as the fallback). `isAlignPause()` tests the same string three ways. `handleFiles()` has an empty `else if` branch. The inner `finish` wrapper in `handleFiles()` is called once and could be the function body.

**S5. Six elements for three labels.** Title and both axis labels each exist twice (fixed and map-attached) and are kept in sync by `renderLabels()`. One set moved between two containers would halve the markup and the sync code.

**S6. Setup export covers some view state and not other.** Saved: location columns, Mercator, calibration, encodings, filters, speaker filter, display toggles, column roles and visibility, active basemap, labels. Not saved: colour ramp choice in practice (B4), custom ramp colours, plot size preset (1x/1.5x/2x/Fit), zoom and pan, legend position, snapshot legend layout and theme, the four "Snapshot PNG includes" checkboxes. Either extend the export or list what it holds in the UI hint.

**S7. Section visibility and sidebar state are spread across `renderAll()`.** The first ten lines of `renderAll()` decide which sidebar sections show. Moving that to its own `updateSidebarVisibility()` makes the gating rules (table loaded → image set → calibration valid) readable in one place. The rules themselves are now drawn on the How it works page.

**S8. Docs sprawl.** Four user-facing documents overlap (`README.md`, `README-plew-map.md`, `TESTDATA-README.md`, `plew-map-integration-guide.md`). You asked to keep the structure, so this PR adds a "Which document do I need?" table to the README instead of merging them. `plew-map-integration-guide.md` describes a one-time setup on the PLeW site with a layout approach this repo no longer uses; consider moving it to that repo or marking it historical.

## Documentation mismatches

Fixed in this PR because the code settles the question:

| # | Where | Was | Now |
|---|-------|-----|-----|
| D1 | `README.md` quick start | `git clone https://github.com/fsame/plew-map.git` | Clones `len-sprague/maplew` |
| D2 | `README-plew-map.md` Encodings table | Four shapes, "repeats above 4 values" | Eight shapes (`SHAPES` in the source), repeats above 8 |
| D3 | `README-plew-map.md` Display options and Exporting | Snapshot PNG "only bakes in fixed-mode labels" | Labels are drawn in either mode, per the four checkboxes (`downloadSnapshot()`) |
| D4 | `README-plew-map.md` Exporting | Snapshot is rendered without `html2canvas` | Points are native; the legend uses `html2canvas` and is skipped with a warning when it cannot load |
| D5 | `layouts/examples/list.html` | "Tiny slices of three corpora" | Seven example pages exist; wording no longer counts them |
| D6 | `TESTDATA-README.md` | Lists five files as present | Notes that only `demo-atlas-calibrated.csv` is in the repo and how to regenerate the rest |

Left for you to decide, because the right answer is not in the code:

| # | Where | Issue |
|---|-------|-------|
| D7 | `README.md`, `DATA-SOURCES.md` | Dataset zip links point at `github.com/fsame/plew-map/releases/tag/datasets-1.0`. Left as is, since the files may only exist there. If they have moved, these four links need updating. |
| D8 | `README-plew-map.md`, `TESTDATA-README.md`, sidebar hints | References to `MERCATOR-PROJECTIONS.md`, a "design doc §4" and `make-basemap.py`. None of the three is in this repository. The user guide now says so next to the first reference; the sidebar hints live in `plew-map.html` and were not touched. |
| D9 | `CHANGELOG.md` | The top section is still titled "Unreleased — `fs-maplew` branch … not yet committed or merged to `main`", and one line under *Changed* says a plain click opens the editor and Shift+click the viewer, which is the reverse of the current code and user guide. History was left alone apart from one new entry describing this PR. |
