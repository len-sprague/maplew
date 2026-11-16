# Working on Maplew

Maplew is a single-file data visualisation tool: `plew-map.html`. Everything else in this repository serves, documents or tests that file. It is the continuous-data sibling of PLeW, which lives in a different repository with different file names; do not carry assumptions over from one to the other.

## Before changing anything

- Read `CODE-MAP.md` for the part you are touching, and its section "Things that bite".
- `plew-map.html` is the only copy of the tool. The Hugo layouts read it from disk. Never paste it into a layout.
- Known bugs and slow spots, with their status, are in `REVIEW-FINDINGS.md`. Fix what you were asked to fix; note anything else there rather than fixing it in passing.

## After every change (code, layouts, examples or documents)

Run the review procedure in **`tools/code-userguide-review.md`**. In short:

```bash
node tools/checks/code-health.js
node tools/checks/behaviour.js --big
```

- For a change to `plew-map.html`, record the behaviour tests before and after and `diff` them (section 3.3 of the procedure). Only lines the change was meant to alter may differ.
- For a bug fix, add a check to `tools/checks/behaviour.js` that fails on the old code and passes on the new.
- Update `CODE-MAP.md`, `README-plew-map.md`, `how-it-works.html`, `REVIEW-FINDINGS.md` and `CHANGELOG.md` wherever the change makes them wrong, then record the stamp with `node tools/checks/code-health.js --stamp`. `code-health.js` fails until the stamp matches the code.
- Put the review report, or a summary of it including what was not checked, in the pull request description.

## House rules

- Work on a branch and open a pull request against `main`; do not push to `main`.
- No build step, no framework, no new dependencies in `plew-map.html`. It must keep working when opened directly from disk.
- The user-facing documents are read by people who have data but do not code. Plain words, exact button labels.
