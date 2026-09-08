# Adding plew-map to the PLeW site

Goal: get `https://len-sprague.github.io/PLeW/plew-map/` live, with a button on the homepage (`https://len-sprague.github.io/PLeW/`) linking to it.

This was tested with a local Hugo build (v0.123.7, close to the repo's pinned v0.128.0 in `.github/workflows/hugo.yml`) against a clone of `len-sprague/PLeW`. The build succeeded, `/plew-map/` rendered correctly, the homepage button resolved to `/PLeW/plew-map/`, and the page's own "back to PLeW" link resolved to `/PLeW/`. No changes are needed to `hugo.toml` or the deploy workflow — pushing to `main` already builds and publishes everything under `content/` and `layouts/`.

**No example CSV or image files are needed.** plew-map's two demo datasets (the atlas map and the TOEIC scatter) are generated entirely in-browser via `<canvas>` and JS — there's nothing external to host in `static/`.

---

## What's changing

Three things, all inside your local clone of the repo:

| Change | Path | Type |
|---|---|---|
| 1 | `content/plew-map.md` | new file |
| 2 | `layouts/_default/plew-map.html` | new file |
| 3 | `layouts/index.html` | one line added |

`layouts/_default/` already exists in the repo (it currently holds `example-viz.html`), so you're just dropping a second file in alongside it — no new folders needed.

---

## Step 1 — Add the content page

Create `content/plew-map.md` with this front matter. It's what tells Hugo to route `/plew-map/` through the new layout — the same pattern the site already uses for `content/examples/*.md` → `example-viz.html`.

```toml
+++
title = "plew-map"
description = "Continuous data plotted on a calibrated background image — a sibling visualizer to PLeW."
layout = "plew-map"
date = 2026-08-01
+++
```

(The `date` just needs to not be in the future relative to when you build — today's date is fine.)

## Step 2 — Add the layout

Save the plew-map prototype (downloaded earlier in this conversation as `plew-map.html`) to:

```
layouts/_default/plew-map.html
```

One small addition was made to the version you pasted: a "← Back to PLeW" link under the sidebar subtitle, so people can navigate back to the main app. It uses Hugo's `relURL` so it resolves correctly under the `/PLeW/` GitHub Pages subpath rather than hardcoding a path:

```html
<p style="margin-top:8px;"><a href="{{ "" | relURL }}" style="color:#4ecdc4;text-decoration:none;font-size:12px;">← Back to PLeW</a></p>
```

This goes right after the existing `<p class="subtitle">...</p>` line, before the "Data input" section.

## Step 3 — Add the homepage button

In `layouts/index.html`, find this line (currently around line 1690):

```html
<p style="margin-top:8px;"><a href="{{ "examples/" | relURL }}" style="color:#4ecdc4;text-decoration:none;font-size:12px;">View example datasets →</a></p>
```

Add this line directly after it:

```html
<p style="margin-top:6px;"><a href="{{ "plew-map/" | relURL }}" style="color:#4ecdc4;text-decoration:none;font-size:12px;">🗺️ Check out the new plew-map here!</a></p>
```

## Step 4 — Commit and push

```bash
git add content/plew-map.md layouts/_default/plew-map.html layouts/index.html
git commit -m "Add plew-map: continuous-data visualizer on a calibrated background image"
git push origin main
```

The push triggers `.github/workflows/hugo.yml` automatically — no manual deploy step.

---

## Verify it worked

1. Go to the **Actions** tab on GitHub and confirm the "Deploy Hugo site to Pages" run finished green (usually 1–2 minutes).
2. Visit `https://len-sprague.github.io/PLeW/` — the new "🗺️ Check out the new plew-map here!" link should appear under "View example datasets →" in the sidebar.
3. Click it (or go directly to `https://len-sprague.github.io/PLeW/plew-map/`) — the page should load with the dark PLeW theme, and both **Demo: atlas map** and **Demo: TOEIC scatter** buttons should populate the map and plot points.
4. Click a plotted point to confirm the record modal opens.
5. Click "← Back to PLeW" to confirm it returns to the homepage.

If the Actions run fails, the most likely cause is a Hugo version mismatch or a stray syntax error in the pasted HTML — the error log in the Actions tab will point to the specific line.
