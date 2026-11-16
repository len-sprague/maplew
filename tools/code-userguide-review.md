# Skill: review the Maplew documents against the code

**File:** `tools/code-userguide-review.md`
**Repository:** `len-sprague/maplew` (the tool file is `plew-map.html`). This is not the PLeW repository; PLeW has its own version of this skill with different file names and checks.
**Use it when:** code, layouts or documents in this repository have changed, and you need to know (a) whether the tool still works and (b) whether the code map, the user guide and the other documents still describe what the tool does.

This is a procedure. Any language model with shell access can follow it, and so can a person, by hand. It depends on nothing but `git`, `node`, Playwright and Hugo.

---

## 0. Ground rules

1. **The code is the truth; the documents are claims about it.** When they disagree, the document is wrong, unless the code is plainly broken. In that case report a code defect; do not edit the document to match the defect.
2. **Never accept a claim because it sounds right.** Everything you mark as correct must rest on something you looked at in this session: a line of code, a command's output, or behaviour you observed.
3. **Quote your evidence.** Each finding names a file and function, or the command that was run and what it printed.
4. **Say what you did not check.** "Not verified" is an acceptable result. A guess presented as a check is not.
5. **Review first, edit second.** Write the report (step 7) before changing any document.
6. **Do the whole list.** Do not stop at the first findings and do not sample. If a step cannot be done (no browser, no Hugo), say so in the report and carry on.
7. **One tool file.** `plew-map.html` is the only copy of the tool. The Hugo layouts read it from disk; they do not contain it. If you find a second copy, that is a finding.
8. **Stay inside what was asked.** A review does not fix code. A fix does not refactor its neighbours. Things you notice go in the report or in `REVIEW-FINDINGS.md`.

---

## 1. When to run it

| Situation | Run |
|---|---|
| Any change to `plew-map.html` is finished, before its pull request is opened | **Full** (steps 2–8) |
| A layout, a content page, an example folder or a manifest changed | Steps 2, 3, 6, 7 |
| A document was edited but no code changed | Steps 2, 3.1, 4 or 5 for that document, 7 |
| Someone asks "have the docs drifted?", or before a round of new work | **Full** |

A change is not complete until this has been run and its report is in, or summarised in, the pull request.

---

## 2. Find out what you are reviewing

### 2.1 The files

```bash
grep -l "function renderAll" -r . --include=*.html | grep -v node_modules    # must print only ./plew-map.html
ls *.md *.html tools tools/checks content content/examples layouts layouts/_default static/examples
```

| Document | What kind of claims it makes |
|---|---|
| `CODE-MAP.md` (site: `/code-map/`) | Structure: sections, functions, state fields, call order, rules, the setup file's shape |
| `README-plew-map.md` (site: `/user-guide/`) | Behaviour as a user meets it: labels, steps, gestures, defaults, file names, limits |
| `how-it-works.html` (site: `/how-it-works/`) | Both: a walkthrough for users, and an internals map that names functions |
| `README.md` | Set-up, column conventions, how to add an example, two diagrams |
| `REVIEW-FINDINGS.md` | Findings, each with a location, a described failure and a status |
| `TESTDATA-README.md` | Walkthroughs with exact values |
| `CHANGELOG.md` | What changed; an entry is needed for every user-visible change |

### 2.2 What changed since the documents were last verified

`CODE-MAP.md` ends with a **verification stamp**: the git blob hash of `plew-map.html` when the documents were last checked.

```bash
git hash-object plew-map.html
grep -A4 "Verification stamp" CODE-MAP.md | tail -1
```

If they differ, find the commit that had the stamped hash and read the whole change:

```bash
STAMP=<hash from CODE-MAP.md>
for c in $(git log --format=%H -- plew-map.html); do
  [ "$(git rev-parse "$c:plew-map.html")" = "$STAMP" ] && echo "$c" && break
done
git diff <that commit> -- plew-map.html layouts content
```

Write down, in plain words, each thing that changed: functions added, removed or renamed; fields of `S`; labels; defaults; anything fetched or exported; any rule about when something happens. **This list is your set of suspects.** Each item must be traced into the documents in steps 4 and 5.

If no commit matches the stamp, treat everything as unverified.

---

## 3. Check the code itself

### 3.1 Static checks

```bash
node tools/checks/code-health.js
node tools/checks/code-health.js --inventory > /tmp/inventory.txt     # functions by section, globals, state fields
```

| Check | A failure means |
|---|---|
| `script-parses` | Syntax error. Nothing else matters until this passes. |
| `functions-defined-once` | Two functions share a name; the later one silently wins. |
| `no-unused-functions`, `no-unused-globals` | An orphan. Either the edit removed its last caller (delete it, or say why it stays) or a call was lost by mistake. |
| `inline-handlers-exist` | An `onclick=` or similar names a function that is not defined. That control is dead. |
| `element-ids-exist` | The script looks up an id that no element has. |
| `state-fields-declared` | A field of `S` is used but not declared in the `S` literal (or declared and never used). Declare it, and decide whether `ingestCSV()` must reset it and whether the setup file should carry it. |
| `code-map-names-exist` | `CODE-MAP.md` names something that no longer exists. Stale document. |
| `code-map-covers-code` | The code has a function, state field or global the code map does not mention. Undocumented. |
| `code-map-banners` | A section banner was added, renamed or reordered. |
| `how-it-works-names-exist` | The internals map on the How it works page names a function that is gone. |
| `examples-consistent` | An example page points at a missing manifest, a manifest lists a missing file, or a setup file is not valid. |
| `verification-stamp` | The tool has changed since the documents were verified. Expected during a review; must pass at the end (step 8). |

### 3.2 Behaviour and break tests

```bash
node tools/checks/behaviour.js --big
```

One line per check. `SMOKE-*` lines cover the editor, both demos and every example page listed in `content/examples/`. The other groups are named after the finding they guard (`B1-*`, `P1-*`, `B3-*`, `P2-*`). **Any FAIL, and any "page errors" text, is a finding of the highest severity.**

`--big` adds a 200,000-row check. `--only <prefix>` runs one group. `--html <file>` tests another copy of the tool, which is how you get a "before".

### 3.3 Record, then diff

For any change to `plew-map.html`:

```bash
git show <base commit>:plew-map.html > /tmp/before.html
node tools/checks/behaviour.js --big --html /tmp/before.html | grep -E '^(PASS|FAIL)' | sed 's/^[A-Z]* //; s/ | expected.*//' > /tmp/before.txt
node tools/checks/behaviour.js --big                         | grep -E '^(PASS|FAIL)' | sed 's/^[A-Z]* //; s/ | expected.*//' > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt
```

PASS and FAIL lines carry no timings, and the `svg` value on smoke lines is a hash of everything drawn. So the lines that differ must be exactly the ones the change was meant to alter. **Any other differing line is a regression until explained.** Put the diff, or a summary of it, in the report.

### 3.4 For a fix: prove it, then try to break it

1. **Before and after.** The failure must be seen on the old code and be absent on the new. A fix that was never seen failing has not been shown to work. If no check covers the finding, add one to `tools/checks/behaviour.js` first and watch it fail.
2. **Neighbours.** List the functions the change touched and, from `CODE-MAP.md` section 5, everything that calls them. Exercise each caller. (`onLocChange()` has six callers; `renderAll()` has dozens.)
3. **Edges.** Try what the author may not have: no table; a header-only table; one row; one column; a column of identical values; empty cells; every value filtered out; a blank frame; a dropped image; two images; a sidecar; an embedded calibration row; a setup file applied afterwards; the same action on an example page; the same action after a demo.
4. **Names.** For every identifier added or renamed: defined once, spelled the same at every use, and, if it is state, reset where `ingestCSV()` resets its neighbours and included in `buildVisualizationConfig()` if a saved view should carry it.
5. **Leave the new checks in.** Break tests written for a fix stay in `behaviour.js`, named after the finding.

### 3.5 Prove what an edit changed

A sample is not proof. Show the whole change and read all of it:

```bash
git diff --stat
git diff -U0 -- plew-map.html
```

---

## 4. Check the code map, claim by claim

`code-health.js` proves that names exist and that nothing is missing. It cannot tell whether a sentence about a name is true. Go through `CODE-MAP.md` from the top:

| Claim | Test |
|---|---|
| A row of the "script section order" table | Does that banner hold those things? Use the inventory. |
| "What runs when the page opens" | Read the top-level statements of the script, in order. |
| A row of a state table (*holds*, *written by*) | `grep -n "S\.<field>" plew-map.html`, read each write. |
| "State that lives in the page" | For each control id, find where it is read. |
| A call tree in section 5 | Read that function's body, call by call, in order. |
| A rule ("a row is drawn when…", "edges are kept when…") | Read the conditions and restate each. For the calibration rules in 7.3, the `B1-*` checks are the executable version: the table and the checks must agree. |
| The setup file's shape and version | Compare field by field with `buildVisualizationConfig()`. |
| A row of the interface table | Find the control in the markup, follow its handler. |
| An item of "Things that bite" | Is it still true? A fixed finding must be reworded or removed. |
| A row of "The files around the tool" | `ls` the path. |

Then the other way round: for each item on your list of suspects (2.2), is the new behaviour described somewhere in the map?

---

## 5. Check the user-facing documents

For `README-plew-map.md` and Part 1 of `how-it-works.html`. A reader follows these literally, so exact wording matters.

1. **Every bold label** must match the text on screen, character for character. Search the markup and the label-setting script for each.
2. **Every "do this → get this"**: find the handler and confirm the effect.
3. **Every stated default and number** (8 shapes, 10 colours, 6% padding, 900×640 frame, 6 files at a time): find the constant.
4. **Every file name** under Exporting: compare with the `triggerDownload(` and `.download =` lines.
5. **Every keyboard shortcut**: compare with the `keydown` listener.
6. **Every limitation, workaround and "Good to know"**: is the code still like that? When a fix lands, the warning must go or be reworded. A guide that warns about a bug that no longer exists misleads as much as one that omits a live bug.
7. **The tables on the How it works page** (which file does what, what unlocks what, what each save keeps, where calibration comes from, what triggers what): each row is a claim; check it like one.
8. **Coverage:** every control a user can operate should be reachable from the user guide. List any that are not.

For `README.md`: commands, paths, front-matter fields (compare with what `layouts/_default/example-map.html` reads from `.Params`), the manifest format, and both Mermaid diagrams.

For `REVIEW-FINDINGS.md`: give every finding a status, **open**, **fixed** (name the pull request), **partly fixed** or **no longer applies**. A fixed finding stays in the file, marked as fixed: the file is also the record of what was wrong.

---

## 6. Build the site and check its links

The site is deployed in a sub-folder, so test it in one.

```bash
hugo --destination /tmp/maplew-site --baseURL http://127.0.0.1:8770/maplew/ --cleanDestinationDir
node tools/checks/links.js /tmp/maplew-site
```

Use the Hugo version in `.github/workflows/hugo.yml`. A build that prints `ERROR`, or a new `WARN`, is a finding. The link check opens the editor, the gallery, each guide page and one example; a link that leaves the sub-folder, does not answer 200, or points at a missing `#anchor` is a finding. It also confirms the sidebar links the layouts add by script are present.

In layouts, `{{ "/" | relURL }}` does **not** stay inside the sub-folder. Use `{{ .Site.Home.RelPermalink }}` for the home page and paths without a leading slash (`{{ "user-guide/" | relURL }}`) for the rest.

Without Hugo: say so in the report. `behaviour.js` still exercises every example without it.

---

## 7. Write the report

```markdown
# Document review — <date>

**Reviewed:** plew-map.html (<blob hash>, <n> lines)
**Against:** documents as of commit <hash>
**Reason:** <"after fix B2", "routine", …>
**Method:** <code-health + behaviour tests + Hugo build + link check | what was actually run>
**Not done:** <anything skipped, and why>

## Result
<One or two sentences: is the tool stable? Are the documents accurate?>

## Code health
- code-health.js: <n> passed, <n> failed — <list>
- behaviour.js: <n> passed, <n> failed — <list>
- Before/after diff: <the lines that changed, and that each was intended>
- Site build and links: <result>

## Findings
| # | Severity | Document § | The document says | The code does | Evidence | Proposed change |
|---|---|---|---|---|---|---|

## Status of findings in REVIEW-FINDINGS.md
| Finding | Status | Evidence |
|---|---|---|

## Undocumented
<Things in the code that no document mentions.>
```

| Severity | Meaning |
|---|---|
| **Blocker** | The tool is broken: page error, lost data, a failing check, a fix that does not fix |
| **Wrong** | A reader following the document would be misled about what the tool does |
| **Stale** | A name or reference no longer points at the right thing, but the meaning is still right |
| **Missing** | Something in the code that the documents should mention and do not |
| **Note** | Worth knowing; no change needed |

A review with no findings still produces the report, with the tables empty and "Not done" filled in.

---

## 8. Bring the documents up to date

Only after the report exists.

1. Make the edits the report proposes. Change what is wrong and nothing else.
2. `CODE-MAP.md`: new functions go in the function index **and** in the section that explains them; changed call order goes in section 5; changed rules in sections 6–8.
3. `README-plew-map.md` and `how-it-works.html`: update labels, steps and tables; remove or reword warnings about behaviour that has been fixed.
4. `REVIEW-FINDINGS.md`: mark fixed findings as fixed and name the pull request.
5. `CHANGELOG.md`: one entry per user-visible change.
6. **Record the stamp last**, when the code is final:
   ```bash
   node tools/checks/code-health.js --stamp
   node tools/checks/code-health.js          # must now pass completely
   ```
   If the code changes again, the stamp is wrong again.
7. Rebuild the site and run the link check once more: the published guide pages are made from these files.
8. Put the report, or a summary of it with the "Not done" line, in the pull request description.

---

## Checklist

- [ ] Confirmed `plew-map.html` is the only copy of the tool (2.1)
- [ ] Compared the blob hash with the stamp; read the full diff since the stamp; listed the suspects (2.2)
- [ ] `code-health.js` run; every failure understood (3.1)
- [ ] `behaviour.js --big` run; no FAIL, no page errors (3.2)
- [ ] Before/after outputs diffed; every differing line intended (3.3)
- [ ] For a fix: failure seen before, absent after; neighbours and edges tried; new checks added (3.4)
- [ ] Whole change read with `git diff` (3.5)
- [ ] Code map: every claim type tested; every suspect traced into it (4)
- [ ] User guide, How it works, README: labels, steps, defaults, file names, warnings, coverage (5)
- [ ] `REVIEW-FINDINGS.md`: a status for every finding (5)
- [ ] Site built under a sub-folder; link check run (6)
- [ ] Report written, including what was not done (7)
- [ ] Documents updated; stamp recorded; all checks pass (8)
