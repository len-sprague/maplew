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

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `hugo` is not recognized | Install Hugo Extended and open a new terminal |
| Page will not load | Check that `hugo server` is still running |
| Port 1313 in use | `hugo server --port 1314` |
