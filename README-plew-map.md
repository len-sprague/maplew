# plew-map — User guide

**plew-map** plots CSV records at exact positions over a background image — a geographic map, a scanned figure, a plot frame, or nothing at all — and lets you click any point to open its full record with audio, video, and image attachments. It's the continuous-data sibling of the PLeW categorical visualizer and shares its column conventions and detail-modal design.

For ready-made test files with exact calibration values, see `TESTDATA-README.md`. For where the AlpiLinK, DoReCo, and ALLSSTAR data come from, see `DATA-SOURCES.md`. This document is the day-to-day user guide.

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

Coordinates must be numeric. Rows with non-numeric coordinates are skipped and counted in a visible notice — they are not silently dropped.

**Media** values can be absolute URLs (including YouTube links, which embed with timestamp support), or bare filenames/relative paths that match media files you drop alongside the CSV (matched by basename).

---

## Step 1 — Location columns

The X and Y dropdowns are pre-selected by, in priority order: `loc::` prefixes → name heuristics (`lon`/`lng`/`x` vs `lat`/`y`) → the first two numeric columns. Override freely.

The **Web Mercator** checkbox pre-transforms the Y coordinate for latitude data plotted on web-map imagery. Rule of thumb: on for screenshots of Google Maps/OpenStreetMap-style maps, off for everything else — full beginner explanation in `MERCATOR-PROJECTIONS.md`.

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
| Shape | categorical only | circle / square / diamond / triangle; warns and repeats above 4 values. |

Numeric columns default to continuous and can be forced categorical (e.g., coded levels); the reverse is disabled. Any channel can be set to "— none —".

## Display options

**Point size** scales every point in every mode. **Size as separate ring** de-links the channels: the fill dot keeps a fixed size and carries color, while the size variable becomes an independent open ring — the two-glyph style of the TOEIC reference figure. **Lat/lon graticule** draws constant-X and constant-Y lines *in data space* through the calibration, so Mercator's unequal latitude spacing and affine tilt become visible; note that a blank frame's faint gray gridlines are part of the frame image itself, not this graticule.

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

## JSON and extra media

Drop `.json` / `.jsonl` as well as CSV. **Load media files…** adds audio, video, ELAN, or TextGrid after the table is already on the map. Mixed drops still work: CSV + images + wavs in one go.

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

**📸 Snapshot PNG** composites the background image and the point overlay (including any visible graticule and calibration markers) into a single PNG at the image's native resolution, named `<dataset>-snapshot.png`. Unlike PLeW's `html2canvas` approach, the snapshot is rendered natively from the SVG overlay, so shapes, rings, and gradient-colored points export exactly as displayed.

**📤 Export setup** / **📥 Import setup** save encodings, filters, calibration, and column roles as JSON (no image or audio). Re-apply after loading the same table.

---

## Current limitations (prototype)

Exactly three calibration points (no least-squares over-determination yet); the background image itself is not embedded in CSV or setup JSON, so a shared dataset still travels as CSV + image pair.
