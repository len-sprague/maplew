# "maplew" (a.k.a. plew-map)

Plots CSV records on a calibrated background image (a map, a figure, or a blank frame). Click a point for the full record, with audio, video, ELAN `.eaf`, and Praat TextGrid when you drop those files too.

Continuous-data sibling of [PLeW](https://github.com/len-sprague/PLeW) (also see [PLeW-NLG](https://github.com/fsame/PLeW-NLG). Column prefixes: `loc::`, `dim::`, `med::`, `desc::`.

Maplew's early versions were developed by @len-sprague (core functionality and structure) and later updated and refined by @fsame (refined plot editability, elat and textgrid functionality, and more!), both evolving in concert with research collaborator feedback. Current repo contains the most up-to-date iteration of maplew from both contributors. 

## Quick start

1. Clone and enter the repo:

```
git clone https://github.com/fsame/plew-map.git
cd plew-map
```

2. Install Hugo Extended ([releases](https://github.com/gohugoio/hugo/releases), or `brew install hugo` / `winget install Hugo.Hugo.Extended`).

3. From the project root:

```
hugo server
```

4. Open http://localhost:1313/

You can also open `plew-map.html` directly in a browser. Use **Demo: atlas map** or **Demo: TOEIC scatter** for an instant example, or drop a CSV + image (+ audio) onto the page. Example corpora (local use): http://localhost:1313/examples/

Day-to-day use: `README-plew-map.md`. Where the corpora come from: `DATA-SOURCES.md`.

## Example data

Audio bundles are not in git. Download a drop-in zip from [Releases](https://github.com/fsame/plew-map/releases/tag/datasets-1.0), unzip, and drop the folder onto plew-map.

| Bundle | Contents |
|--------|----------|
| `alpilink-I01-bundle.zip` | Alpine varieties, tasks I01+I02 |
| `doreco-africa-mini.zip` | Nine DoReCo Africa languages, one text each |

ALLSSTAR (world Englishes) wavs stay on [SpeechBox](https://speechbox.linguistics.northwestern.edu/ALLSSTARcentral/#!/recordings).

## Sharing your own example dataset

If you have your own data and want collaborators to explore it in plew-map — without them needing to install anything — you can host your own copy of this site and add your dataset as a new example page. Once it's live, you just send collaborators a link.

### Step 1: Get your own copy of plew-map online

1. On GitHub, fork this repository into your own GitHub account (button in the top-right of the repo page).
2. In your fork, go to Settings → Pages, and under "Build and deployment", set Source to GitHub Actions. (This repo already includes the workflow file that builds the site with Hugo — you don't need to write one yourself.)
3. Push any commit to your fork's `main` branch (even a small one, like editing this README) to trigger the first build. You can watch its progress under the Actions tab.
4. After the build finishes (usually 1–2 minutes), your own example gallery will be live at:

```
https://<your-github-username>.github.io/<your-repo-name>/examples/
```

Bookmark this — it's your permanent home for examples going forward.

### Step 2: Add a new example dataset

Each example page is a small folder of files (your CSV, a background image, and any media) plus a short manifest and a content page that tells plew-map about it — no coding required.

1. **Prepare your CSV.** plew-map extends PLeW's column-prefix convention with one more, for coordinates:
   * `loc::` — a position coordinate, e.g. `loc::lon`, `loc::lat`, or any numeric axis like `loc::x_speech_rate`
   * `dim::` — a variable to encode with color/size/shape (e.g. `dim::language`)
   * `med::` — media: audio, image, video, or a YouTube link (e.g. `med::recording`)
   * `desc::` — descriptive text, shown only in the detail popup (e.g. `desc::transcript`)

   Prefixes are optional — plew-map falls back to name heuristics (`lat`/`lon`/`x`/`y`, `audio_url`, `transcript`, and similar) — but prefixed columns always win and are the most reliable way to get the right treatment.

2. **Add a background image and media, if you have one.** Not every dataset needs a map or figure behind it — plain scatter data is fine with no image at all. If you do have a background (a map, a scanned figure, etc.), put it, your CSV, and any audio/video/ELAN/TextGrid files together in a new folder under `static/examples/`, e.g. `static/examples/<your-dataset-name>/`. Reference media in the CSV by filename (matched by basename) or with a full `https://` link.

3. **Calibrate (only if you have a background image).** Run `hugo server` (or open `plew-map.html` directly) and drop your CSV and image onto the page. Use Step 2 (Calibration) to tell plew-map how your coordinates map onto the image — Image edges is simplest for most maps. Once it looks right, click **💾 Save to CSV**: the download has the calibration embedded in a reserved row, so anyone who loads that file gets the correct positions automatically, with no extra sidecar file needed. Replace your draft CSV in `static/examples/<your-dataset-name>/` with this saved version.

   (If you want to offer several switchable basemaps for the same data, as the AlpiLinK example does, write a `<your-image>.png.calib.txt` sidecar per image instead — see the existing examples under `static/examples/` for the format.)

   **No background image?** Click **No background** instead of dropping an image — plew-map generates a blank frame and auto-fits the axes to your data's own coordinate range, so there's nothing to align and this calibration step can be skipped. You can still fine-tune the display — colors, point size/spacing, shapes, filters — under Step 3 (Encodings) and Display options, then click **📤 Export setup** to save those choices as a JSON file. Keep that file in your dataset folder alongside the CSV as a record of your configuration; it isn't loaded automatically, but anyone can reproduce your exact view by downloading it and using **📥 Import setup** after opening the page.

   A manifest with only a CSV loads the data table but leaves the plot area hidden — visitors need to click **No background** once themselves to reveal it (a small note on your example page is a good idea, e.g. mention it in the page's `description`).

4. **List your files in a manifest.** Create `static/examples/<your-dataset-name>/manifest.json` naming every file the example needs to load:

```json
{
  "files": [
    "your-dataset.csv",
    "your-map.png"
  ]
}
```

If you have no background image, just list the CSV (plus any media files).

5. **Create the content page.** From a terminal in the project folder, run:

```
hugo new content/examples/<your-dataset-name>.md
```

Open the new file, remove the `draft = true` line so it will actually publish, and fill in the rest:

```
+++
title = "My Dataset"
description = "A short description shown on the example gallery card."
layout = "example-map"
manifest = "examples/<your-dataset-name>/manifest.json"
weight = 10
+++
```

`weight` controls where the page appears in the example gallery (lower numbers first).

6. **Test locally.** With `hugo server` running, open `http://localhost:1313/examples/<your-dataset-name>/` and confirm your data loads, positions look right (calibration, or the auto-fit blank frame), and any media plays correctly. Adjust column prefixes or calibration as needed.

### Step 3: Publish and share

1. Commit your changes and push them to your fork (directly to `main`, or via a pull request into your own `main` if you prefer to review first).
2. Once the changes are on `main`, GitHub Actions automatically rebuilds and redeploys your site — no extra steps needed.
3. Your new dataset will be live at:

```
https://<your-github-username>.github.io/<your-repo-name>/examples/<your-dataset-name>/
```

4. Share that link directly with collaborators — it opens straight into plew-map with your dataset already loaded, no upload required (if you calibrated a background image, points are positioned correctly right away; for a no-image dataset, a visitor just clicks **No background** once to reveal the auto-fit plot).

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `hugo` is not recognized | Install Hugo Extended and open a new terminal |
| Page will not load | Check that `hugo server` is still running |
| Port 1313 in use | `hugo server --port 1314` |
