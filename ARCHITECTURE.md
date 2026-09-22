# maplew (plew-map): a technical account of a single-file visualization tool

This document is a close reading of the codebase as it exists on this branch — not a design proposal. Every claim below is anchored to a specific file and, for behavioral claims, a specific function in `plew-map.html`. Where the surrounding documentation (`README.md`, `README-plew-map.md`, `CHANGELOG.md`) states intent, this document checks that intent against what the code actually does, and flags the few places where they diverge.

## 1. Synopsis

**maplew** (repository name `maplew`, application name `plew-map`) is a browser-based tool for plotting tabular records — a CSV or JSON/JSONL table — at literal pixel positions over a background image, and for inspecting each plotted record's attached media (audio, video, images, ELAN `.eaf` and Praat `.TextGrid` alignments) by clicking on it. Positions are continuous data (arbitrary numeric coordinates, not categories), which is what distinguishes it from its sibling project [PLeW](https://github.com/len-sprague/PLeW), a categorical visualizer it shares column conventions and modal design with.

The entire application — HTML structure, CSS, and JavaScript — lives in one file: `plew-map.html`, 3,858 lines. There is no build step, no bundler, no package.json, no transpilation, and (with one narrow exception, `html2canvas`, discussed in §3.9) no runtime dependency fetched from anywhere but the file itself. Opening the file directly in a browser (`file://plew-map.html`) is a fully supported, first-class way to run the application; the `README.md` quick-start says so explicitly, and nothing in the code special-cases a served-over-HTTP context except the optional Hugo integration layer described in §3.1.

This "one HTML file is the whole program" approach is a deliberate paradigm, not an oversight:

- **Zero-install distribution.** A collaborator gets the tool by downloading one file, or by being sent a link. `README.md` documents cloning-then-opening as a valid path alongside the Hugo dev server.
- **Self-contained data round-trips.** The application's own CSV export can carry a full calibration back into itself via one reserved row (§3.5), so "share a link" and "share a file" are both terminal — no companion config file is *required* for the core use case.
- **A file *is* a page.** Because the artifact is static HTML+JS with no server-side logic, the Hugo layer that produces the GitHub Pages example gallery (§3.1) works by literally reading this file's bytes at site-build time and splicing in a small bootstrap `<script>` — it does not re-implement or wrap the application, it reuses it verbatim.

The trade-off this buys: a 183 KB, ~3,900-line file with no module boundaries enforced by tooling. The code compensates with a strict internal convention rather than a build-time one — see §2.

## 2. Coding paradigms in play

The script (`plew-map.html:537`–`3856`) is written in un-bundled, ES2017-ish vanilla JavaScript, loaded as a single classic (non-module) `<script>` tag. A few paradigms recur consistently enough to be load-bearing for understanding the rest of the document:

**A single mutable global state object.** Everything the application knows about the current session — the parsed table, the calibration, the encodings, the undo stack, drag state, filters — lives on one object, `S` (`plew-map.html:597`):

```js
const S = {
  headers:[], data:[], cols:{},           // cols[key] = {role, numeric, values, uniq}
  imageUrl:null, imgW:0, imgH:0, isFrame:false, imageSet:false,
  locX:null, locY:null, mercator:false,
  calib:{ mode:'edges', edges:{L:null,R:null,T:null,B:null}, pts:[mkPt(),mkPt(),mkPt()], affine:null, placing:-1, valid:false, prefilled:false },
  enc:{ color:{...}, size:{...}, shape:{col:''} },
  filters:{}, speakerFilter:{...},
  media:{}, alignFiles:{}, alignCache:{}, datasetName:'', skipped:0, pendingCalib:null,
  basemaps:[], activeBasemapId:null,
  view:{ scale:1, tx:0, ty:0 }, zoomBarPos:null,
  editingRow:null, editingIsNew:false,
  originalData:[], undoStack:[], redoStack:[], changeLog:[],
  compare:{ a:null, b:null }, marked:new Set(),
  roleOverrides:{}, columnVisibility:{}, columnRecordOrder:[],
  labels:{ title:'', xAxis:'', yAxis:'', mode:'attached' }
};
```

There is no reactivity system (no Proxy-based observation, no signals, no framework). State is mutated directly by ordinary assignment throughout the file, and any function that changes something the view depends on is expected to call `renderAll()` (or a narrower helper) itself afterward. This is closer to a 2012-era jQuery-adjacent style than to a modern reactive framework — and it is a coherent choice given the "single file, no dependencies" constraint: adopting a reactive framework would mean either vendoring it (defeating the zero-dependency property) or fetching it from a CDN (defeating offline/`file://` use, which the tool explicitly supports).

**Immediate-mode SVG rendering.** `renderAll()` (`plew-map.html:3003`) does not diff or patch the point layer; it clears the `<svg id="overlay">` element's `innerHTML` and rebuilds every plotted shape, ring, calibration marker, and graticule line from scratch on every call:

```js
const svg = document.getElementById('overlay');
svg.setAttribute('viewBox', `0 0 ${S.imgW||1} ${S.imgH||1}`);
svg.innerHTML = '';
...
S.data.forEach((row, rowIdx)=>{
  if (!rowVisible(row)){ filtered++; return; }
  const pt = dataToPixel(row[S.locX], row[S.locY]);
  ...
  const el = shapeEl(shapeFor(row), px, py, r);
  el.addEventListener('mouseenter', e=>{ if (!dragState) showTooltip(e,row); });
  ...
  svg.appendChild(el);
});
```

This is simple to reason about (no stale-DOM bugs, no memoized-render invalidation logic) at the cost of being O(rows) per interaction tick rather than O(changed rows). Given the tool's target scale — corpora in the tens to low thousands of points, not millions — this is a reasonable, load-bearing simplification rather than an oversight; there is no virtualization or canvas-based point layer.

One exception to "rebuild everything": **point dragging** (`startPointDrag`, `plew-map.html:2893`) does *not* call `renderAll()` on every `mousemove`. It mutates the single dragged element's SVG attributes directly (`moveShapeEl`, ring `cx`/`cy`) and only triggers a full `renderAll()` on mouse-up. This is the one place in the file where the immediate-mode convention is deliberately broken for performance, and it is a narrow, well-contained exception rather than a second rendering paradigm.

**Event-driven, not component-driven.** Interactive elements are wired with `addEventListener` calls made during the same render pass that creates them (see the snippet above), or via inline `onclick="..."` attributes in server-side-style HTML string templates (e.g. `openRecordEditor`, `plew-map.html:3372`, builds a form as a template string and injects it with `innerHTML`). There are no custom elements or component classes; a "component" in this codebase is a function that returns/injects an HTML string plus the DOM queries needed to read it back.

**A closed, hand-rolled parsing/formatting layer instead of libraries.** CSV parsing (`parseCSV`, `plew-map.html:794`), delimiter sniffing (`detectDelimiter`, `:764`), an EAF (ELAN) XML parser (`parseEAF`, `:1435`), and a Praat TextGrid parser (`parseTextGrid`, `:1491`) are all written from scratch rather than pulled from a library — again consistent with the zero-runtime-dependency constraint.

## 3. System architecture

### 3.1 Two deployment surfaces sharing one artifact

The repository ships the tool two ways, and the second is built *from* the first rather than being a separate implementation:

1. **Standalone.** `plew-map.html` opened directly, or served by any static file host, as-is.
2. **Hugo-orchestrated gallery.** A [Hugo](https://gohugo.io/) static site (`hugo.toml`, `content/`, `layouts/`) that presents a homepage, a user guide, and an "example datasets" gallery (`content/examples/*.md`), each example page being the *same* application pre-loaded with a specific dataset. This is what `.github/workflows/hugo.yml` builds and deploys to GitHub Pages on every push to `main`.

The mechanism by which an "example page" becomes a pre-loaded instance of the app is worth spelling out because it is the architectural crux of the whole repo: `layouts/_default/example-map.html` is not a rewritten template — it reads the application's own HTML source at build time and injects a bootstrap script into it:

```gotemplate
{{ $html := readFile "plew-map.html" }}
{{ $setupJS := "" }}
{{ with .Params.setup }}{{ $setupJS = printf "window.PLEW_SETUP=%s;" (. | relURL | jsonify) }}{{ end }}
{{ $boot := printf `<script>window.PLEW_HUGO=true;window.PLEW_EXAMPLES_INDEX=%s;window.PLEW_GUIDE=%s;window.PLEW_EXAMPLE=%s;%s</script>`
    ("examples/" | relURL | jsonify) ("user-guide/" | relURL | jsonify) (.Params.manifest | relURL | jsonify) $setupJS }}
{{ replace $html "<body>" (printf "<body>\n%s" $boot) | safeHTML }}
```

In plain terms: Hugo takes the literal bytes of `plew-map.html`, string-replaces the opening `<body>` tag with `<body>` followed by a small inline script that sets four global flags (`PLEW_HUGO`, `PLEW_EXAMPLES_INDEX`, `PLEW_GUIDE`, `PLEW_EXAMPLE`, and optionally `PLEW_SETUP`), and serves the result. Nothing else about the file is touched. At the end of the application's own script, a plain conditional consumes those flags (`plew-map.html:3830`–`3855`):

```js
if (window.PLEW_EXAMPLE){
  showDatasetLoading();
  loadRemoteExample(window.PLEW_EXAMPLE).then(()=>{
    if (window.PLEW_SETUP) return loadRemoteSetup(window.PLEW_SETUP);
  }).catch(e=>{ console.error(e); setStatus('inputStatus','err','Could not load the example dataset.'); })
    .finally(()=>{ hideDatasetLoading(); });
}
```

`loadRemoteExample` (`:3810`) fetches a `manifest.json` naming every file the example needs, fetches each one as a `Blob`, and — this is the key design decision — wraps each fetched blob in a `File` object and hands the whole array to `handleFiles()`, **the same function that handles a user's drag-and-drop drop event**:

```js
async function loadRemoteExample(manifestUrl){
  const res = await fetch(manifestUrl);
  const man = await res.json();
  const base = manifestUrl.replace(/[^/]+$/, '');
  const files = [];
  for (const name of man.files){
    const r = await fetch(base + name);
    files.push(new File([await r.blob()], name));
  }
  await handleFiles(files);
  if (!S.imageSet) useBlankFrame();
}
```

The practical consequence is that there is exactly one ingestion code path (§3.3) regardless of whether files arrive by drag-and-drop, by the file picker, or by a server fetch simulating a drop — the Hugo layer never needed its own "load a dataset" logic. `plew-map-integration-guide.md` documents a third, ad hoc deployment of the same idea (embedding the file as a Hugo layout page in a *different* repository, PLeW, with one added "back" link) — again by pasting the file's contents into a new layout rather than modifying the source file's behavior.

A Hugo build produces three other content types from the same site, and one of them extends the same "read the source file at build time" trick to plain Markdown: `content/_index.md` (homepage), `content/user-guide.md` → `layouts/_default/user-guide.html`, which reads `README-plew-map.md` directly (`{{ readFile "README-plew-map.md" | markdownify }}`) and renders it inside a themed page shell — so the published user guide is guaranteed to stay in sync with the same file documented in §4, with no separate copy to fall out of date — and `content/examples/_index.md` → `layouts/examples/list.html` (the gallery index), plus per-dataset pages under `content/examples/`.

### 3.2 Column classification: a small typed-prefix DSL

Before anything can be plotted, every column in the ingested table is assigned a **role** — `loc` (location/coordinate), `dim` (a variable to encode visually), `med` (media reference), `desc` (long-form text shown only in the record modal), `res` (reserved/hidden), or `auto` (unclassified) — by `classifyColumns()` (`plew-map.html:851`). Roles are determined by, in priority order:

1. **An explicit prefix**, e.g. `loc::lon`, `dim::language`, `med::audio`, `desc::transcript`, `res::flag` — stripped for display via `displayName()` and matched by `parsePrefix()` (`:588`) against a fixed table:

   ```js
   const COLUMN_PREFIXES = { 'loc::':'loc', 'dim::':'dim', 'med::':'med', 'desc::':'desc', 'res::':'res' };
   ```

2. **A manual override** the user set via the "Column roles" sidebar section (`S.roleOverrides`), which — notably — is checked *before* the prefix, so a user's explicit retagging always wins even over a prefixed header.
3. **Name heuristics** when no prefix or override exists: a small pattern table (`MEDIA_URL_PATTERNS`, `:580`) catches names like `audio_url`, `image_src`, `video-link`; a fixed word list (`DESC_LIKE`, `:579`: `gloss`, `transcript`, `translation`, `note`, …) catches descriptive-text columns.
4. Anything left over defaults to a plain data column (`auto`), and is later offered as a candidate for `dim` encodings.

Coordinates are further pre-selected by `guessLocColumns()` using `loc::` prefixes first, then `lon`/`lng`/`x` vs. `lat`/`y` name matching, then simply the first two numeric columns — but this is always an editable default, not a binding decision; Step 1 of the UI lets the user override X/Y assignment freely.

This is the "PLeW contract" the code comments refer to (e.g. `plew-map.html:3320`, `// TOOLTIP & MODAL (PLeW contract)`) — plew-map's column-typing convention is an extension of PLeW's own (`loc::` is the one prefix plew-map adds), which is how the two sibling tools stay interoperable at the data-file level without sharing code.

### 3.3 Ingestion pipeline

`handleFiles(fileList)` (`plew-map.html:2109`) is the single entry point for every file arrival, from either a `<input type="file">` change event, a drag-and-drop `drop` event on `#fileDrop` or the map itself, or the synthetic `File` array built by `loadRemoteExample()`. Its structure, in pseudocode:

```
handleFiles(files):
    bucket each file by extension:
        *.calib.txt          → calibFiles      (sidecar calibration for a basemap image)
        *.csv | *.tsv | json → csvFiles
        *.eaf | *.TextGrid   → alignFiles
        image extensions     → imgs
        audio/video ext.     → mediaFiles

    csvFile = pickMapCsv(csvFiles)      # prefers a table with loc:: columns,
                                         # then one with recognizable lat/lon headers
    if csvFile:
        ingestCSV(csvFile.text(), csvFile.name)   # replaces S.data / S.headers wholesale

    referenced = set of every non-empty cell value's basename across the loaded table
                 (used to tell "a dropped image is a basemap" from
                  "a dropped image is a per-row media attachment")

    apply any *.calib.txt sidecars to matching basemap images (by filename)
    basemapImgs = imgs not referenced by any cell
    mediaImgs   = imgs that ARE referenced by a cell  → media, not basemap

    if basemapImgs found:
        build S.basemaps[] (data-URL, optional sidecar calibration), activate one
    read mediaFiles + mediaImgs into S.media{filename: blobURL}
    register alignFiles into S.alignFiles{filename: File}   # parsed lazily, on demand

    report a status line summarizing what loaded and what's still missing
    renderAll()
```

The image/basemap-vs-media disambiguation (`referenced` set) is the mechanism that lets a single drag-and-drop of "CSV + map PNG + several photo JPEGs referenced by `med::photo`" route the map PNG to the background and the photos to per-record media, with no separate UI step — the classification is purely by whether the filename appears as a cell value anywhere in the just-loaded table.

`ingestCSV()` (`:2230`) is where a freshly parsed table becomes the live dataset: it strips out any row whose first cell is the literal marker `__PLEWMAP_CALIB__` (saving its JSON payload as `S.pendingCalib` for §3.5), reindexes the remaining rows, resets essentially all per-dataset UI state (undo stack, filters, marks, column overrides, encodings), re-runs `classifyColumns()` and `guessLocColumns()`, and finally calls `applyEmbeddedCalib()` to restore any calibration that row carried.

**Format support beyond CSV.** `parseDataFile()` (`:839`) dispatches to `parseJSON()` (`:810`) for `.json`/`.jsonl`/`.ndjson` files, which accepts a bare array, `{rows:[...]}`, `{data:[...]}`, a single object, or newline-delimited JSON, and flattens nested objects/arrays to JSON strings so they behave as ordinary text-cell values downstream. `parseCSV()` itself (`:794`) sniffs the delimiter (comma, tab, or semicolon) by testing which one splits the first ten lines into a consistent column count (`detectDelimiter`, `:764`), and implements RFC 4180-style quoting by hand in `splitLine()` (`:778`) rather than via a regex split.

### 3.4 Calibration: three coordinate-transform modes plus a Web Mercator pre-projection

The core geometric problem plew-map solves is: given a row's raw data coordinates (e.g. longitude/latitude, or two arbitrary numeric axes), compute the pixel position on the background image, and — for the inverse direction needed by drag-to-reposition and click-to-add — go from a pixel back to data coordinates. Three modes coexist behind one interface, `dataToPixel()` / `pixelToData()` (`plew-map.html:1252`, `:1274`), selected by `S.calib.mode`:

- **`pixels`** — the data already *is* pixel space; both functions are the identity (modulo rounding).
- **`edges`** — a linear map per axis from the data's declared left/right/top/bottom bounds to the image's `[0, imgW] × [0, imgH]` box:

  ```js
  // dataToPixel, edges branch
  const {L,R,T,B} = C.edges;
  const pT = projY(T), pB = projY(B);
  return [ (tx-L)/(R-L)*S.imgW, (ty-pT)/(pB-pT)*S.imgH ];
  ```

  Top/bottom may be supplied in either numeric order, so both y-up and y-down datasets work without a separate flag. The inverse (`pixelToData`) is the same formula solved for `tx`/`ty`.

- **`affine`** — a full 2-D affine transform (rotation, skew, and independent per-axis scale) solved exactly from three user-picked reference points, for scanned maps or tilted screenshots with no usable frame. `solveAffine()` (`:1235`) sets up two independent 3×3 linear systems (`px = a·x + b·y + c`, `py = d·x + e·y + f`) and solves each by Cramer's rule with a shared determinant:

  ```js
  function solveAffine(){
    const P = S.calib.pts;                       // 3 reference points
    const x = P.map(p=>Number(p.dx)), y = P.map(p=>projY(Number(p.dy)));
    const M = [[x[0],y[0],1],[x[1],y[1],1],[x[2],y[2],1]];
    const D = det3(M);
    if (Math.abs(D) < 1e-9) return { degenerate:true };   // collinear points caught here
    const [a,b,c] = solve(P.map(p=>Number(p.px)));
    const [d,e,f] = solve(P.map(p=>Number(p.py)));
    return { a,b,c,d,e,f };
  }
  ```

  Collinear reference points make the system singular (`|D| < 1e-9`); the code detects this rather than dividing by (near-)zero, and the UI surfaces it as an explicit error (per `TESTDATA-README.md`'s "things worth deliberately breaking" section, which cross-checks this exact behavior).

**Web Mercator.** All three modes can optionally pre-transform the Y (latitude) axis through `projY()` (`:1230`) before the linear/affine step, and back through its inverse `invProjY()` (`:1270`) when going from pixels to data — this is what the `S.mercator` toggle controls, intended for screenshots of Google-Maps/OSM-style slippy-map tiles, whose vertical axis is not linear in latitude:

```js
function projY(v){
  if (!S.mercator) return v;
  const lat = Math.max(-85, Math.min(85, v));            // Mercator's standard clamp
  return Math.log(Math.tan(Math.PI/4 + lat*Math.PI/360));
}
```

**Self-describing exports.** A calibrated CSV can carry its own calibration so that re-uploading it requires no manual entry at all. `downloadCSV()` → `generateCSV()` (`:3600`) appends one reserved row whose first cell is the marker and whose second cell is a JSON-stringified payload built by `buildCalibPayload()` (`:3594`, mode, Mercator flag, chosen X/Y columns, and either the four edge values or the three affine points); `ingestCSV()`/`applyEmbeddedCalib()` (§3.3) is the reverse leg of that round trip. This is the mechanism `README.md` calls "the same self-describing-export philosophy as PLeW's anchor rows," and it is the reason the example-dataset authoring workflow in §4.5 can ship one calibrated CSV instead of a CSV-plus-sidecar-config pair for the common case.

### 3.5 Encoding and rendering pipeline

Once a table is loaded, calibration is valid, and X/Y columns are chosen, three independent visual channels — color, size, shape — can each be bound to a column (`S.enc.color/size/shape`, populated via the Step 3 UI, `encCandidates()`/`populateEncSelectors()`, `:2463`–`2519`). Each channel has its own small interpretation function called once per row during `renderAll()`:

- `colorFor(row)` (`:2766`) — continuous columns interpolate through a ramp (`viridis`, a blue→orange diverging ramp, a greens ramp, or a user-picked two-color custom ramp) via `lerpColor()`; categorical columns index into a fixed 10-color palette (`COLORS`, `:541`) by category rank, overridable per value through `S.enc.color.catColors`.
- `sizeFor(row)` (`:2780`) — continuous columns linearly interpolate a pixel radius between user-set min/max; categorical columns step evenly across the same range by category index.
- `shapeFor(row)` (`:2796`) — categorical only, cycling through an 8-shape set (`SHAPES`, `:542`: circle, square, diamond, triangle, star, pentagon, hexagon, cross) built by hand as SVG path data (`regularPolygonPath`, `starPath`, `crossPath`, `:543`–`576`) since SVG has no native "regular polygon" or "star" primitive.

`renderAll()` (§2, `:3003`) then walks `S.data` once, for each visible row (post-filter, see `rowVisible()`, `:2570`) computing its pixel position via `dataToPixel()`, optionally displacing overlapping points (§3.6), building and appending the shape element, and wiring its interaction handlers inline (drag handlers if drag mode is on, else click/hover handlers). A **graticule** overlay (`drawGraticule()`, `:3191`) can additionally draw constant-X/constant-Y reference lines sampled *through* the active calibration — making a non-linear effect like Mercator's unequal latitude spacing, or an affine transform's skew, visually inspectable as bent gridlines rather than an abstract parameter.

### 3.6 Overlap handling: deterministic jitter, not physics

Rows that resolve to (nearly) identical coordinates would otherwise render as a single indistinguishable stacked marker. `buildStackInfo()` (`:3151`) groups row indices by exact coordinate-string equality (`stackKey`, `:3148`) once per render; `jitterPx()` (`:3166`) then displaces each member of a stack deterministically using a golden-angle spiral rather than random scatter or a force-directed layout:

```js
function jitterPx(stackIndex, stackSize, baseR, marginPx){
  if (stackSize <= 1) return [0, 0];
  let spread = Math.max(baseR * 2.4, 14) * Math.min(2.8, 0.55 + stackSize / 10);
  if (Number.isFinite(marginPx)) spread = Math.min(spread, Math.max(8, marginPx * 0.85));
  const golden = Math.PI * (3 - Math.sqrt(5));           // ≈ 137.5°, the golden angle
  const angle = stackIndex * golden;
  const radius = spread * Math.sqrt((stackIndex + 0.5) / stackSize);
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}
```

The golden-angle spiral (the same construction used for phyllotaxis/sunflower-seed patterns) gives an even, non-overlapping fan-out for any stack size without needing an iterative relaxation step, and it is deterministic — the same dataset always jitters the same way. `maybeAutoJitter()` (`:3176`) turns the jitter toggle on automatically the first time a loaded dataset actually contains coincident coordinates, so the behavior is opt-out rather than requiring the user to notice the problem first.

### 3.7 Interaction and the undo/redo command log

Edits — moving a point (drag), adding one (click-to-add), editing a record's fields, or deleting one — are not applied as silent, un-tracked mutations. Each edit is recorded as a small **command object** pushed onto `S.undoStack` by `pushUndoAction()` (`:889`), capped at `MAX_UNDO = 40` entries (`:620`), and every push clears the redo stack (standard undo/redo semantics — a fresh edit invalidates any stashed "redo" branch):

```js
function pushUndoAction(action){
  S.undoStack.push(action);
  if (S.undoStack.length > MAX_UNDO) S.undoStack.shift();
  S.redoStack = [];
  updateUndoUI();
}
```

Three action shapes cover every edit type: `{type:'fields', changes:[{rowIndex, field, oldValue, newValue}, ...]}` for in-place edits (including a drag, which is logged as a two-field change to the X/Y columns on mouse-up — see `startPointDrag`, `:2893`), `{type:'add', row}` for a newly created record, and `{type:'delete', row, index}` for a removed one. `undo()`/`redo()` (`:902`, `:919`) are each a small dispatch over these three shapes, replaying or reversing them and moving the action to the opposite stack. A parallel, append-only `S.changeLog` (distinct from the undo stack, and *not* truncated) records a human-readable label and timestamp for every action, independent of undo state, and can be downloaded as JSON (`downloadChangeLog()`, `:967`) — an audit trail that survives even after the undo history itself has been exhausted or overwritten.

Two other interaction modes worth noting because they are easy to miss from the README alone:

- **Compare mode.** Alt-clicking a second point opens a side-by-side table (`renderCompareModal()`, `:1073`) of the two selected records with differing fields visually highlighted, tracked in `S.compare = {a, b}`.
- **Marking.** Ctrl/Cmd-click toggles membership in `S.marked` (a `Set` of row indices), rendered as a dashed ring, for keeping a handful of points visually flagged during exploration without altering the data or the current filter/selection state.

### 3.8 Media, ELAN, and Praat TextGrid handling

A record's media columns (`med::` prefix, or heuristically detected) can hold an absolute URL (including YouTube links, auto-embedded with timestamp support via `toYouTubeEmbed()`, `:1315`), or a bare filename/relative path matched by basename against files dropped alongside the CSV — resolved by `resolveMediaUrl()` (`:1307`) against the `S.media{filename: objectURL}` map populated during ingestion. `getRowMedia()` (`:1321`) collects every populated media column for a row into a uniform list the modal then renders as tabs (audio player, video, image, or YouTube iframe — `mediaHTML()`, `:3535`).

For corpora with time-aligned transcription — the DoReCo and AlpiLinK example datasets in this repo — plew-map additionally hand-parses **ELAN** `.eaf` XML (`parseEAF()`, `:1435`, walking `TIME_SLOT` and `ALIGNABLE_ANNOTATION` elements into a tier structure) and **Praat TextGrid** text format (`parseTextGrid()`, `:1491`), and can render a waveform for the associated audio by drawing pre-computed peak data to a `<canvas>` (`drawPraatWave()`, `:1547`) rather than depending on any audio-visualization library. An alignment viewer (`bindAlignViewer()`, `:1765`) synchronizes tier spans with the `<audio>` element's current playback time, and — going beyond read-only display — supports **in-place editing** of transcription text (`startAlignEdit()`/`commitAlignEdit()`, `:1919`–`1977`) with re-serialization back to either format (`serializeTextGrid()`, `:1979`; `serializeEAF()`, `:1992`) for download.

### 3.9 Export

Three outputs, all client-side, no server round-trip:

- **`Save to CSV`** (`downloadCSV()` → `generateCSV()`, `:3600`/`:3617`) — the current table, original headers (with any role-prefix retagging applied via `displayRolePrefix()`) and current cell values, correctly CSV-quoted, plus the embedded calibration row described in §3.5 when calibration is valid.
- **`Snapshot PNG`** (`downloadSnapshot()`, `:3627`) — composites the background `<img>` and a clone of the live SVG overlay onto an off-screen `<canvas>` at the image's native resolution, rasterizing the SVG by serializing it to an `data:image/svg+xml` URL and drawing that as an `Image`. Because the point layer is drawn from the same SVG the screen shows (not from a separate `html2canvas` DOM screenshot), shapes, rings, and gradient-colored points export pixel-faithfully; this is a deliberate improvement over PLeW's approach, per `README-plew-map.md`'s explicit comparison. Only "fixed-mode" title/axis labels (pinned to the frame, not the map) are baked into the export via extra canvas margins — "map-attached" labels that pan/zoom with the content are not yet captured, a limitation the code surfaces as a status message rather than silently dropping them.
- **`Export setup` / `Import setup`** (`buildVisualizationConfig()`/`downloadVisualizationConfig()`, `:1128`/`:1144`, and `applyVisualizationConfig()`, `:1161`) — encodings, filters, calibration, column roles, and label text as a standalone JSON file, deliberately excluding the image and audio (kept small, and reusable across re-uploads of the same table).

The one genuine external dependency in the file is `html2canvas` (`<script src="https://cdnjs.cloudflare.com/...">`, `plew-map.html:7`), used only for the record-modal's own "📷 Dark / Light" screenshot button (`displaySnapshot()`, `:1103`) — a narrower, DOM-screenshot-based capture of the popup window itself, not the map. `README-plew-map.md` notes this feature "needs network," correctly flagging it as the one place the tool is not fully offline-capable.

### 3.10 Presentation layer

All styling is a single `<style>` block (`plew-map.html:8`–`264`, ~260 lines) of hand-written CSS — a dark theme (`background:#0f1419`), no CSS framework, no preprocessor, no custom-property design-token system beyond ordinary hard-coded hex values reused by convention (`#4ecdc4` teal as the recurring accent, matching the PLeW sibling project's palette). The sidebar/map two-pane layout, modal overlay, and status-banner styling are all defined here inline with the markup they style, consistent with the file's single-artifact philosophy.

## 4. User operational model

### 4.1 Getting the tool running

Two supported paths, per `README.md`:

- **Direct**: open `plew-map.html` in a browser. No install.
- **Hugo dev server**: `hugo server` from the project root, then `http://localhost:1313/` — this additionally serves the homepage, user guide, and example gallery built from `content/`/`layouts/` (§3.1). Either **Demo: atlas map** or **Demo: TOEIC scatter** produces an instantly populated example with no files needed at all — both demos generate their background image and point data entirely client-side (`loadDemoALI()`/`loadDemoTOEIC()`, `:3701`/`:3757`, using a seeded PRNG, `mulberry32()`, `:3796`, for reproducible synthetic scatter).

### 4.2 Preparing data: the column-prefix convention

A CSV's headers should ideally use the `type::name` convention from §3.2 (`loc::`, `dim::`, `med::`, `desc::`, `res::`), but none of it is mandatory — unprefixed columns fall back to name-based heuristics, and any classification can be corrected after loading via the sidebar's **Column roles** section, which retags a column live and folds the choice back into the header on the next CSV export (`setColumnRole()`, `:987`; `displayRolePrefix()`, `:1001`).

### 4.3 Calibration workflow (Step 2)

For a dataset with a background image, three calibration modes are available in the sidebar (§3.4): **Image edges** (type the data value at each of the image's four edges — pre-filled from the data's own min/max range as an explicit, clearly-labeled *guess*, not a calibration, until the user overwrites it), **Three-point** (click three spread reference points on the image, type their true data coordinates, let the affine solve handle rotation/skew), or **Pixels** (the data is already in image-pixel space). Once calibration succeeds, `S.calib.valid` gates the rest of the UI — the encoding, display, edit-positions, and export sections stay hidden (`renderAll()`, `:3008`) until there is somewhere to plot to.

### 4.4 Exploring a plotted dataset

- **Hover** a point → tooltip with its leading non-hidden fields (`showTooltip()`, `:3346`).
- **Click** → full record modal with a media tab strip.
- **Shift+click** → same modal in explicit read-only-then-editable form (vs. plain click, which in drag/add mode context opens the editor directly).
- **Alt+click** → set as the second slot in a two-record comparison table.
- **Ctrl/Cmd+click** → toggle a dashed "marked" ring.
- **Ctrl/Cmd+Z / Shift+Z** → undo/redo the edit history (§3.7).
- **B** → toggle the sidebar (`toggleSidebar()`, `:884`), for a wider map view.
- **Esc** → close the open modal.

This is the full keyboard/mouse contract as implemented; it matches the table in `README-plew-map.md` verbatim, which this review confirms against the actual event bindings (`plew-map.html:1009` `onPointClick`, `:2893` `startPointDrag`, plus the document-level `keydown` handling for undo/redo and Escape).

### 4.5 Sharing a curated dataset with collaborators

`README.md`'s "Sharing your own example dataset" walkthrough corresponds directly to the mechanism in §3.1/§3.3:

1. Calibrate the dataset once in the running app, then **Save to CSV** — the download carries calibration embedded, so any later re-upload (by anyone) reproduces the exact positions automatically (§3.4).
2. Optionally, **Export setup** to also capture encodings/filters/roles as a small JSON file.
3. Put the calibrated CSV, any local media, and (if used) the setup JSON into `static/examples/<dataset-name>/`, alongside a `manifest.json` listing every locally-referenced filename:

   ```json
   { "files": ["your-dataset.csv", "your-map.png"] }
   ```

4. Create `content/examples/<dataset-name>.md` with Hugo front matter pointing `manifest` (required) and `setup` (optional) at those paths, using the `example-map` layout.
5. Push to `main`; `.github/workflows/hugo.yml` rebuilds and republishes the Pages site automatically (Hugo Extended v0.128.0, pinned), and the new page is live at `.../examples/<dataset-name>/`.

Visiting that URL is, mechanically, exactly the standalone tool with `loadRemoteExample()` (§3.1) running before the user does anything — the "curated view" a collaborator sees on first load is produced by the identical code path a local drag-and-drop would trigger, just fed by `fetch()` instead of the OS file picker.

## 5. Known limitations, stated by the code and docs themselves

Documented in `README-plew-map.md`'s "Current limitations (prototype)" section and independently confirmed against the implementation:

- **Exactly three calibration reference points.** `solveAffine()` is hard-coded to a 3-point exact solve (`S.calib.pts` is always length 3, `plew-map.html:601`); there is no least-squares fit over more points, so affine calibration cannot yet average out marking error across a larger reference set.
- **The background image itself is never embedded** in the CSV or the setup JSON — the embedded-calibration mechanism (§3.4) carries *parameters*, not the image bytes, so a shared calibrated dataset still travels as a CSV-plus-image (or CSV-plus-manifest, for the Hugo gallery path) rather than a single file.
- **Map-attached title/axis labels are not captured by Snapshot PNG** (§3.9) — only frame-pinned labels are baked into the exported raster; this is surfaced to the user via an explicit status message rather than a silent gap.
- **The `html2canvas` CDN dependency** (§3.9) means the one feature it powers — the record modal's own dark/light screenshot button — requires network access even when the rest of the tool is being used entirely offline from a local file.

None of these are contradicted by the code; each is either directly enforced by a fixed constant (the length-3 points array) or explicitly messaged to the user at the relevant moment, which is a reasonable design choice for a stated "prototype."

## 6. File inventory

| Path | Role |
|---|---|
| `plew-map.html` | The entire application: markup, styling, and logic (§2–§3). |
| `hugo.toml` | Hugo site config (title, `baseURL` default, Goldmark `unsafe = true` to allow raw HTML in Markdown content). |
| `content/`, `layouts/` | The Hugo wrapper site: homepage, user guide, and example gallery, built around `layouts/_default/example-map.html`'s `readFile`-and-splice trick (§3.1). |
| `static/examples/<name>/` | Per-dataset assets (calibrated CSV, background image(s), media, `manifest.json`, optional exported setup JSON) for the gallery. |
| `.github/workflows/hugo.yml` | Builds the Hugo site (pinned Hugo Extended 0.128.0) and deploys it to GitHub Pages on every push to `main`. |
| `README.md` | Project overview, quick start, and the example-dataset authoring/sharing workflow (§4.5). |
| `README-plew-map.md` | The day-to-day user guide for the application itself (§4). |
| `DATA-SOURCES.md` | Provenance and licensing for the AlpiLinK, DoReCo, and ALLSSTAR corpora used in the example datasets (not shipped in `static/`, or shipped only as small samples — the full corpora are gitignored and distributed via GitHub Releases). |
| `TESTDATA-README.md` | Hand-calibration walkthroughs and edge cases for exercising the app without the demo buttons. |
| `plew-map-integration-guide.md` | A worked example of embedding `plew-map.html` as a page inside a *different* Hugo site (the sibling PLeW repo), by the same read-and-splice approach as `example-map.html`. |
| `CHANGELOG.md` | Feature history. Its "Unreleased" section is attributed to a `fs-maplew` development branch that no longer exists in this repository (only `main` and this working branch are present) — the features it lists (undo/redo, drag-to-reposition, click-to-add, the record editor, editable labels, categorical field picker) are all present in `plew-map.html` on this branch, so that section is best read as already merged despite the file's own branch-mapping table. |
