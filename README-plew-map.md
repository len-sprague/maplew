# plew-map — User guide

**plew-map** plots CSV records at exact positions over a background image — a geographic map, a scanned figure, a plot frame, or nothing at all — and lets you click any point to open its full record with audio, video, and image attachments. It's the continuous-data sibling of the PLeW categorical visualizer and shares its column conventions and detail-modal design.

For ready-made test files with exact calibration values, see `TESTDATA-README.md`. For where the AlpiLinK, DoReCo, and ALLSSTAR data come from, see `DATA-SOURCES.md`. This document is the day-to-day user guide. If you are new and want the overall picture first (what happens to your files, which sidebar step unlocks which, what each save button keeps), start with the **How it works** page: `how-it-works.html` in this folder, or `/how-it-works/` on the site.

---

## Quick start

Open `plew-map.html` in a browser, or from this folder run `hugo server` and go to http://localhost:1313/ (also at `/plew-map/`). Then either press a **Demo** button to see a fully configured example instantly, or:

1. **Drop your files** — a CSV plus a background image (and any media files) onto the drop zone, together or one at a time. You can also drop them onto the main plot area.
2. **Step 1: Location columns** — confirm which columns are X and Y.
3. **Step 2: Calibration** — tell plew-map how those coordinates map onto the image.
4. **Step 3: Encodings** — assign columns to color, size, and shape.
5. **Explore** — hover for tooltips, click for the full record.

Each step appears in the sidebar as its prerequisites are met. If you load a CSV without an image, the main area tells you exactly what's needed to unlock calibration.

---

## Preparing your CSV

plew-map uses PLeW's `type::name` column prefixes, extended with `loc::`:

| Prefix | Meaning | Example |
|---|---|---|
| `loc::` | Position coordinate (continuous) | `loc::lon`, `loc::lat`, `loc::x_speech_rate` |
| `dim::` | A variable to encode (color/size/shape) | `dim::language`, `dim::toeic` |
| `med::` | Media URL → rendered in the record modal | `med::video`, `med::audio` |
| `desc::` | Long text → shown in the modal table only | `desc::transcript` |
| `res::` | Reserved/bookkeeping → hidden everywhere | `res::flag` |

Prefixes are optional. Without them, plew-map falls back to PLeW's heuristics: names like `lat`/`lon`/`x`/`y` suggest location; `audio_url`, `image`, `video_file` and similar become media; `gloss`, `transcript`, `translation`, `note` and similar become descriptions; a `title` or `name` column supplies the record modal's title. Prefixed columns always win over guesses, and `dim::` columns are listed first in every encoding dropdown.

Coordinates must be numeric, written with a decimal point (`46.5`). A decimal comma (`46,5`), which some spreadsheet programs write depending on regional settings, is read as text. Rows with non-numeric coordinates are skipped and counted in a visible notice — they are not silently dropped.

**Media** values can be absolute URLs (including YouTube links, which embed with timestamp support), or bare filenames/relative paths that match media files you drop alongside the CSV (matched by basename).

---

## Step 1 — Location columns

The X and Y dropdowns are pre-selected by, in priority order: `loc::` prefixes → name heuristics (`lon`/`lng`/`x` vs `lat`/`y`) → the first two numeric columns. Override freely.

The **Web Mercator** checkbox pre-transforms the Y coordinate for latitude data plotted on web-map imagery. Rule of thumb: on for screenshots of Google Maps/OpenStreetMap-style maps, off for everything else. (Earlier versions of this guide pointed to a `MERCATOR-PROJECTIONS.md` explainer; that file is not part of this repository.)

If you change the X or Y column after the plot is showing, press **Reset to defaults** in Step 2 so the edge values are guessed again for the new columns. The same applies after loading a different table into a page that already had one.

## Step 2 — Calibration

Calibration is the mapping from data coordinates to image pixels. Three modes:

**Image edges** (default) — type the data value at the image's left, right, top, and bottom edges.
> ⚠️ **The edge boxes come prefilled, but the prefill is a guess, not a calibration.** plew-map fills them from your *data's* min/max range (plus 6% padding) so that something plots immediately. Unless your points happen to span the entire image, these values are wrong: your points will render, but stretched to fill the frame rather than sitting in their true positions. The status panel flags this state as "prefilled (approximate)" until you type your own values. Replace the prefill with the image's true bounds — from the map's stated extent, its graticule labels, or the values in `TESTDATA-README.md` for the demo files. Top/bottom may be entered in either order (y-up and y-down data both work).

**Three-point** — click three spread-out reference points on the image and type each one's data coordinates. plew-map solves the affine transform exactly, handling rotation, skew, and independent axis scaling — the right mode for scanned maps, tilted screenshots, and images with no visible frame. Collinear points are detected and reported.

**Pixels** — the CSV already stores image pixel coordinates; no parameters.

Calibration auto-applies on every change; **Apply calibration & plot** re-runs it explicitly. **Reset to defaults** restores the prefilled edge values and clears all three-point markers and their typed coordinates — one click undoes any accidental edits (including discarding an embedded calibration you'd rather redo).

### Embedded calibration: CSVs that calibrate themselves

A CSV can carry its own calibration, so upload → correctly plotted with zero typing. plew-map checks every uploaded CSV for a **reserved row** whose *first* column contains the marker `__PLEWMAP_CALIB__` and whose *second* column holds a JSON payload, e.g.:

```
__PLEWMAP_CALIB__,"{""mode"":""edges"",""mercator"":false,""locX"":""loc::lon"",""locY"":""loc::lat"",""L"":49.6,""R"":51.7,""T"":32.9,""B"":31.0}",,,,
```

If the row exists, it is stripped from the plotted data and used to restore *everything*: the location-column assignments, the Mercator setting, the calibration mode, and either the four edge values or the three affine reference points. The status panel confirms with "✓ Calibration loaded from the embedded CSV row"; you can still edit anything manually to override it, and a malformed payload falls back to the normal prefilled defaults with a warning rather than breaking the upload.

You never need to write this row by hand: after calibrating once, press **Save to CSV** in the Export section (below) and the downloaded file has the row appended. Dataset authors share that one file, and every recipient gets a self-calibrating upload — the same self-describing-export philosophy as PLeW's anchor rows. (The trailing empty cells simply pad the row to the CSV's column count; doubled quotes are standard CSV escaping for the JSON.)

## Step 3 — Encodings

| Channel | Accepts | Notes |
|---|---|---|
| Color | continuous or categorical | Continuous: Viridis, Blue→Orange, Greens, or custom two-color ramp, with a gradient legend. Categorical: 10-color palette with per-value pickers in the legend. |
| Size | continuous or categorical | Radius interpolated between your min/max px (continuous) or stepped per value (categorical). |
| Shape | categorical only | circle / square / diamond / triangle / star / pentagon / hexagon / cross; warns and repeats above 8 values. |

Numeric columns default to continuous and can be forced categorical (e.g., coded levels); the reverse is disabled. Any channel can be set to "— none —".

## Display options

**Point size** scales every point in every mode. **Size as separate ring** de-links the channels: the fill dot keeps a fixed size and carries color, while the size variable becomes an independent open ring — the two-glyph style of the TOEIC reference figure. **Lat/lon graticule** draws constant-X and constant-Y lines *in data space* through the calibration, so Mercator's unequal latitude spacing and affine tilt become visible; note that a blank frame's faint gray gridlines are part of the frame image itself, not this graticule.

**Title & axis labels** — click the title or an axis label directly on the plot to type one in; Enter commits, Esc reverts. The **Title & axis labels pan/zoom with the map** checkbox (on by default) decides how they behave when you navigate: on, labels sit on the map itself and move/scale with it as you zoom and pan, so they can be panned out of view like any other map content — the more "explorable data" behavior. Off pins them around the plot frame instead, at a constant size and always visible regardless of zoom. Labels round-trip through **Export setup** / **Import setup** JSON. **Snapshot PNG** draws the title and axis labels into extra margin around the image in either mode; the **Snapshot PNG includes** checkboxes in the Export section decide which of them appear.

## The record modal

Hover any point for a tooltip of its leading fields; click to open the full record: a title (from `title`/`name`/ID), a field table (including `desc::` columns), and a tabbed media viewer for every populated `med::`/media column — audio player, video, YouTube embed, or image. Escape or clicking outside closes it and stops playback.

**📷 Dark / Light** in the record header captures the window as a PNG (needs network for `html2canvas`).

### Compare two records

**Alt+click** a second point to open a side-by-side table. Differing fields are highlighted. **Clear B** or **Clear all** resets the slots. **Shift+click** still opens the editor.

### Marks

**Ctrl/Cmd+click** rings a point in white dashes so you can keep a handful of locations in view.

## Edits and undo

Moving, adding, editing, or deleting a point is recorded. **Undo** / **Redo** (Ctrl/Cmd+Z) and **Reset all** live in the **Edits** sidebar. **Change log** downloads a JSON list of those actions.

## Column roles

After a table is loaded, **Column roles** lets you retag a column (`loc` / `dim` / `desc` / `med` / `res`) and hide fields in the record window. Save to CSV writes the role as a prefix on the header.

## Filters, legend controls and stacked points

These live in **Encodings**, **Display** and the **Legend**, and appear once the plot is showing.

- **Filter categories.** Every categorical colour, size or shape column gets a row of chips under Encodings. Untick a chip to hide that category; **All** / **None** set the whole row. Clicking an entry in the legend does the same thing.
- **Legend overrides.** Each legend row carries its own control: a colour picker, a size in px, or a shape menu. **Reset scale** and **Reset shapes** return to the defaults (A–Z order).
- **Legend on the map.** *Show legend on map* mirrors the legend onto the plot. Drag its ⋮⋮ grip to move it, − to minimize it. **Snapshot export setting** at its foot chooses where the legend goes in a Snapshot PNG (beside or below the plot) and its frame (dark, light or a custom colour); **Preview** shows the result in place.
- **Spread stacked points.** When several rows share exactly the same coordinates, this fans them out so each can be clicked. It switches itself on when a newly loaded table has such rows. It changes the drawing only; saved coordinates are untouched.
- **Plot size.** The 1x / 1.5x / 2x / Fit buttons next to the zoom controls change how large the plot box is on screen, separately from zooming into it.
- **Explore speaker.** Appears only when the table has a column named `speaker` or `speaker_id` (with or without a prefix). It filters the map to chosen speakers; *Only speakers with multiple stimuli* keeps speakers who have more than one distinct value in a column named `image`, `task` or `stimulus`. A record of such a speaker also lists their other recordings.

## Several backgrounds for one table

Drop more than one background image with the table and a **Background map** section lets you switch between them. Each image can bring its own calibration in a small text file with the same name plus `.calib.txt` (for example `alps-default.png.calib.txt`), containing one line each for `L:`, `R:`, `T:` and `B:` and optionally `Mercator Y: ON`. Edge values you type while one background is showing are remembered for that background.

Calibration can therefore arrive from three places. They are applied in this order, the later one winning: the reserved row in the CSV, then the sidecar of the background being shown, then a setup JSON. Anything you type afterwards overrides all three.

## Transcripts (ELAN and Praat)

Drop `.eaf` or `.TextGrid` files with the table and they appear under the audio player of the matching record. A file matches when a media column names it, or when it has the same name as the record's `med::audio` file apart from the ending. ELAN files show as chunks with a play button each; TextGrids show as a timeline with a waveform (click the waveform to play from that point). Click any text to correct it, then **Download ELAN** / **Download TextGrid** to save the corrected file. The browser cannot overwrite your original.

## JSON and extra media

Drop `.json` / `.jsonl` as well as CSV. (A setup file is also `.json`: load it with **Import setup**, not the drop zone, or it will be read as a table.) **Load media files…** adds audio, video, ELAN, or TextGrid after the table is already on the map. Mixed drops still work: CSV + images + wavs in one go.

## Keyboard

| Key | Action |
|---|---|
| **B** | Show or hide the sidebar |
| **Click** | View record (compare slot A) |
| **Shift+click** | Edit record |
| **Alt+click** | Compare as slot B |
| **Ctrl/Cmd+click** | Mark point |
| **Ctrl/Cmd+Z** | Undo |
| **Ctrl/Cmd+Shift+Z** | Redo |
| **Esc** | Close the record window |

## Exporting

The **Export** section appears once the plot is live, mirroring the download tools in the original PLeW editor:

**💾 Save to CSV** downloads the current dataset (original headers and values, proper quoting) with the calibration embedded as the reserved row described above, named `<dataset>-calibrated.csv`. If calibration isn't valid yet, the CSV still downloads — just without the row, and with a warning saying so.

**📸 Snapshot PNG** composites the background image and the point overlay (including any visible graticule and calibration markers) into a single PNG at the image's native resolution, named `<dataset>-snapshot.png`. The points are rendered natively from the SVG overlay, so shapes, rings, and gradient-colored points export exactly as displayed. Four checkboxes choose whether the title, X-axis label, Y-axis label and legend are added in the margins. The legend is the one part drawn with the `html2canvas` library, which is loaded from the internet: offline, the PNG is still saved, without the legend, and a warning says so. The snapshot always shows the whole image, whatever the current zoom and pan.

**📤 Export setup** / **📥 Import setup** save encodings, filters, calibration, and column roles as JSON (no image or audio). Re-apply after loading the same table.

---

## Current limitations (prototype)

Exactly three calibration points (no least-squares over-determination yet); the background image itself is not embedded in CSV or setup JSON, so a shared dataset still travels as CSV + image pair.

Also worth knowing:

- Avoid line breaks inside a cell. A note with a line break saves correctly but is split into two rows when the CSV is loaded again.
- A category value or column name containing an apostrophe (`Valle d'Aosta`) plots normally, but its filter chip and legend click do not respond.
- Continuous colour or size becomes slow on large tables (several seconds per redraw at 5,000 rows). Categorical encodings stay fast. Tables above roughly 100,000 rows do not load.
- The colour ramp choice is not restored by **Import setup**; pick it again after importing.
- Record-window snapshots and the legend in Snapshot PNG need an internet connection; everything else works offline.

Details and proposed fixes for each are in `REVIEW-FINDINGS.md`.
