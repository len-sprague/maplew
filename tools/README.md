# tools/

Everything needed to check a change to Maplew. Written to be run by a person or by an AI coding tool.

| File | What it is |
|------|------------|
| `code-userguide-review.md` | **The procedure.** Run it after every change: it says which checks to run, how to read them, and how to bring the documents back in line with the code. |
| `checks/code-health.js` | Static checks, no browser: the script parses, no orphaned functions or variables, every handler and element id exists, `CODE-MAP.md` matches the code, examples are consistent, verification stamp. |
| `checks/behaviour.js` | Browser tests: the editor, both demos, every example page, and break tests named after the finding they guard (`B1-*`, `P1-*`, `B3-*`, `P2-*`). |
| `checks/links.js` | Link check on a built site served under a sub-folder. |

## Running

```bash
npm i playwright && npx playwright install chromium     # once; behaviour.js and links.js need it
```

```bash
node tools/checks/code-health.js
```

```bash
node tools/checks/behaviour.js --big
```

```bash
hugo --destination /tmp/maplew-site --baseURL http://127.0.0.1:8770/maplew/ --cleanDestinationDir
```

```bash
node tools/checks/links.js /tmp/maplew-site
```

Each prints one `PASS` / `FAIL` line per check and exits with code 1 if anything failed.

## Adding a check

Add a `check('<FINDING>-<what>', '<expected, in words>', async (open)=>{ … })` block to `behaviour.js`. Inside, `const p = await open()` gives a page with the tool loaded and a small helper object `T` (see the top of `open()` for what it offers). Return `{ ok, observed }`. Keep timings out of `observed` (put them in `info`) so that two runs can be compared with `diff`. Watch the new check fail on the old code before you trust it on the new.
