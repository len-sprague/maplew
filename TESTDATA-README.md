# plew-map test data

Four files for exercising the full upload → calibrate → encode flow by hand. Both CSVs are byte-compatible with the built-in demo buttons, so you can cross-check your manual setup against the one-click result.

## Files

| File | What it is |
|---|---|
| `demo-atlas.csv` | 24 settlements: `loc::lon`, `loc::lat`, `dim::language`, `dim::vowel`, `desc::note`, `med::video` (YouTube link → tests the modal embed) |
| `demo-atlas-calibrated.csv` | Same dataset with an embedded `__PLEWMAP_CALIB__` row — drop it with the map PNG and calibration configures itself; use it to test auto-calibration, and the plain CSV to test manual calibration |
| `demo-atlas-map.png` | 900×760 province-style background for the atlas CSV |
| `demo-toeic.csv` | 90 learners: `loc::x_speech_rate`, `loc::y_passiveness`, `dim::lexical_richness` (numeric), `dim::toeic` (numeric), `desc::task` |
| `demo-toeic-frame.png` | 900×640 plain plot frame for the TOEIC CSV (or press **No background** instead) |

## Atlas walkthrough

1. Drag `demo-atlas.csv` **and** `demo-atlas-map.png` onto the drop zone together. The PNG isn't referenced by any CSV cell, so it auto-routes to *background*; the CSV parses alongside it.
2. **Step 1** — `loc::lon` / `loc::lat` should be pre-selected. Leave Mercator off (2° of latitude — see design doc §4.3).
3. **Step 2** — Image edges mode; enter exactly:
   `Left = 49.6  Right = 51.7  Top = 32.9  Bottom = 31.0`
   (These are the geographic bounds the image was generated with, so points land inside the province.) Or try **Three-point** instead: place points on any three settlements and type their lon/lat from the CSV — the affine solve should land everything identically.
4. **Step 3** — Shape = `language`, Color = `vowel` (categorical). In the legend, set /ü/ ≈ `#8bdb4d`, /ö/ ≈ `#5a8f3c`, none = `#ffffff` for the atlas look.
5. Toggle **Lat/lon graticule** in Display, then flip **Web Mercator** on and off — watch the latitude lines redistribute (subtly, at this extent).
6. Click any settlement → record modal with the YouTube embed.

## TOEIC walkthrough

1. Drop `demo-toeic.csv` + `demo-toeic-frame.png` together (or CSV alone, then **No background**).
2. **Step 1** — `loc::x_speech_rate` / `loc::y_passiveness` pre-select via the `x`/`y` name heuristics.
3. **Step 2** — Image edges: `Left = 80  Right = 210  Top = 1.08  Bottom = -0.08`.
4. **Step 3** — Color = `lexical_richness`, continuous, Blue → Orange ramp. Size = `dim::toeic`, continuous, min 4 / max 14.
5. In **Display**, check **Size as separate ring** — the fill dot stays a fixed size carrying color, and TOEIC score becomes an independent open ring, matching the original figure. Uncheck to collapse both channels into one glyph.
6. Drag **Point size** — it now scales everything in every mode.

## Things worth deliberately breaking

- Swap Top/Bottom edge values → the map flips vertically (both orderings are legal; this is how y-down data works).
- In three-point mode, place three collinear points → the degenerate-transform error appears.
- Delete a coordinate cell in the CSV → that row is counted in the "skipped" notice.
