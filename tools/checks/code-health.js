#!/usr/bin/env node
/*
 * Static checks on plew-map.html and on the documents that describe it. No browser needed.
 *
 *   node tools/checks/code-health.js           # run every check
 *   node tools/checks/code-health.js --stamp   # after a review: record the current blob hash in CODE-MAP.md
 *   node tools/checks/code-health.js --inventory   # print the inventory (functions by section, state, ids…) and exit
 *
 * Output: one PASS / FAIL line per check, details indented below a FAIL. Exit code 1 if any FAIL.
 * What each check means, and what to do when it fails, is in tools/code-userguide-review.md.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const TOOL = 'plew-map.html';
const MAP = 'CODE-MAP.md';
const read = (f)=>fs.readFileSync(path.join(ROOT, f), 'utf8');
const args = process.argv.slice(2);
// Browser and language functions the code map may name with () although the tool does not define them.
const KNOWN_BUILTINS = new Set(['fetch', 'requestAnimationFrame', 'Number', 'html2canvas', 'setTimeout', 'querySelector', 'getElementById', 'addEventListener']);

const html = read(TOOL);
const lines = html.split('\n');
const scriptStart = lines.findIndex(l=>l.trim() === '<script>');
const scriptEnd = lines.findIndex((l, i)=>i > scriptStart && l.trim() === '</script>');
const script = lines.slice(scriptStart + 1, scriptEnd).join('\n');
const markup = lines.slice(0, scriptStart).join('\n');

// ── inventory ──
const functions = [];            // { name, line, section }
const sections = [];             // { title, line }
let section = '(before first banner)';
lines.forEach((l, i)=>{
  if (i <= scriptStart || i >= scriptEnd) return;
  if (/^\/\/ ={20,}/.test(l) && /^\/\/ [A-Z]/.test(lines[i + 1] || '') && /^\/\/ ={20,}/.test(lines[i + 2] || '')){
    section = lines[i + 1].replace(/^\/\/\s*/, '').trim(); sections.push({ title:section, line:i + 2 });
  }
  const m = l.match(/^(?:async\s+)?function\s+([A-Za-z0-9_]+)/) || l.match(/^\(function\s+([A-Za-z0-9_]+)/);
  if (m) functions.push({ name:m[1], line:i + 1, section, iife:l.startsWith('(') });
});
const fnNames = new Set(functions.map(f=>f.name));
const topLevel = [];
lines.forEach((l, i)=>{ if (i > scriptStart && i < scriptEnd){ const m = l.match(/^(?:let|const)\s+([A-Za-z_][A-Za-z0-9_]*)/); if (m) topLevel.push(m[1]); } });
const sBlock = script.slice(script.indexOf('const S = {'), script.indexOf('\n};', script.indexOf('const S = {')));
const sDeclared = new Set(); { let depth = 0, tok = '';
  // top-level keys of the S literal
  for (const ch of sBlock.slice(sBlock.indexOf('{') + 1)){
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    if (depth === 0){ if (/[A-Za-z0-9_]/.test(ch)) tok += ch; else { if (ch === ':' && tok) sDeclared.add(tok); tok = ''; } }
    else tok = '';
  } }
const sUsed = new Set((script.match(/\bS\.([A-Za-z_][A-Za-z0-9_]*)/g) || []).map(x=>x.slice(2)));
const ids = new Set((html.match(/\bid="([^"${}]+)"/g) || []).map(x=>x.slice(4, -1)));

if (args.includes('--inventory')){
  console.log(`${TOOL}: ${lines.length} lines; <script> ${scriptStart + 1}–${scriptEnd + 1}`);
  let cur = null;
  functions.forEach(f=>{ if (f.section !== cur){ cur = f.section; console.log(`\n## ${cur}`); } console.log(`  ${String(f.line).padStart(5)}  ${f.name}${f.iife ? '  (runs at load)' : ''}`); });
  console.log('\n## Top-level let/const\n  ' + topLevel.join(', '));
  console.log('\n## Fields of S declared in the literal\n  ' + [...sDeclared].join(', '));
  console.log('\n## Fields of S added later\n  ' + [...sUsed].filter(x=>!sDeclared.has(x)).join(', '));
  process.exit(0);
}

let failed = 0;
function check(id, problems, okText){
  if (problems.length){ failed++; console.log(`FAIL ${id}`); problems.forEach(p=>console.log('     ' + p)); }
  else console.log(`PASS ${id} | ${okText}`);
}
const count = (re, text)=>(text.match(re) || []).length;
const wordRe = (n)=>new RegExp('(?<![A-Za-z0-9_$.])' + n + '(?![A-Za-z0-9_$])', 'g');

// 1. The script parses.
{ const probs = []; try { new vm.Script(script, { filename:TOOL }); } catch (e) { probs.push(`${e.name}: ${e.message}`); }
  check('script-parses', probs, `${scriptEnd - scriptStart - 1} lines of script`); }

// 2. Every function is defined once.
{ const seen = {}, probs = []; functions.forEach(f=>{ (seen[f.name] = seen[f.name] || []).push(f.line); });
  Object.entries(seen).forEach(([n, ls])=>{ if (ls.length > 1) probs.push(`${n} defined at lines ${ls.join(', ')}`); });
  check('functions-defined-once', probs, `${functions.length} functions`); }

// 3. Functions that nothing calls (orphans). Load-time IIFEs call themselves.
{ const probs = [];
  functions.filter(f=>!f.iife).forEach(f=>{ if (count(wordRe(f.name), html) <= 1) probs.push(`${f.name} (line ${f.line}) is defined but never used`); });
  check('no-unused-functions', probs, 'every function is referenced somewhere'); }

// 4. Top-level variables that nothing reads.
{ const probs = []; topLevel.forEach(n=>{ if (count(wordRe(n), script) <= 1) probs.push(`${n} is declared but never used`); });
  check('no-unused-globals', probs, `${topLevel.length} top-level let/const`); }

// 5. Inline handlers (onclick="fn(...)") name functions that exist.
{ const probs = [], seen = new Set();
  (html.match(/\bon[a-z]+="[^"]*"/g) || []).forEach(h=>{
    (h.replace(/^on[a-z]+="/, '').match(/(?<![.A-Za-z0-9_$])[A-Za-z_][A-Za-z0-9_]*(?=\()/g) || []).forEach(n=>{
      if (seen.has(n) || fnNames.has(n)) return; seen.add(n);
      if (['if', 'Number', 'String', 'event'].includes(n)) return;
      probs.push(`handler calls ${n}(), which is not defined`);
    }); });
  check('inline-handlers-exist', probs, 'every function named in an on…="" attribute exists'); }

// 6. getElementById('x') refers to an id that exists (in markup or built by the script).
{ const probs = [], seen = new Set();
  (script.match(/getElementById\('([^'$]+)'\)/g) || []).forEach(g=>{ const id = g.slice(16, -2);
    if (seen.has(id)) return; seen.add(id);
    if (!ids.has(id)) probs.push(`getElementById('${id}') but no element has that id`); });
  check('element-ids-exist', probs, `${seen.size} ids looked up, all present`); }

// 7. Every S.field that is read or written is declared in the S literal or on the list of late fields.
{ const LATE = ['wavePeaks', 'audioCtx', 'stackInfo', '_speakerStats'];   // created on first use; documented in CODE-MAP.md §4
  const probs = [...sUsed].filter(x=>!sDeclared.has(x) && !LATE.includes(x)).map(x=>`S.${x} is used but not declared in the S literal`);
  [...sDeclared].filter(x=>!sUsed.has(x)).forEach(x=>probs.push(`S.${x} is declared but never used`));
  check('state-fields-declared', probs, `${sDeclared.size} declared fields, ${LATE.length} created on first use`); }

// 8. CODE-MAP.md: names it mentions exist; functions and state it should mention are there.
if (fs.existsSync(path.join(ROOT, MAP))){
  const map = read(MAP);
  const ticks = (map.match(/`[^`\n]+`/g) || []).map(t=>t.slice(1, -1));
  const probs = [];
  const mentionedFns = new Set();
  ticks.forEach(t=>{ (t.match(/\b([A-Za-z_][A-Za-z0-9_]*)\(\)/g) || []).forEach(c=>{ const n = c.slice(0, -2); mentionedFns.add(n);
    if (!fnNames.has(n) && !KNOWN_BUILTINS.has(n)) probs.push(`code map names ${n}(), which is not a function in ${TOOL}`); }); });
  ticks.forEach(t=>{ (t.match(/\bS\.([A-Za-z_][A-Za-z0-9_]*)/g) || []).forEach(c=>{ const n = c.slice(2);
    if (!sUsed.has(n) && !sDeclared.has(n)) probs.push(`code map names S.${n}, which the code never uses`); }); });
  check('code-map-names-exist', [...new Set(probs)], 'every function() and S.field named in the code map exists');

  const missing = functions.filter(f=>!new RegExp('(?<![A-Za-z0-9_])' + f.name + '(?![A-Za-z0-9_])').test(map)).map(f=>`${f.name} (section "${f.section}") is not mentioned in the code map`);
  [...sDeclared].filter(x=>!new RegExp('(?<![A-Za-z0-9_])' + x + '(?![A-Za-z0-9_])').test(map)).forEach(x=>missing.push(`S.${x} is not mentioned in the code map`));
  topLevel.filter(x=>!new RegExp('(?<![A-Za-z0-9_])' + x + '(?![A-Za-z0-9_])').test(map)).forEach(x=>missing.push(`top-level ${x} is not mentioned in the code map`));
  check('code-map-covers-code', missing, `all ${functions.length} functions, ${sDeclared.size} state fields and ${topLevel.length} globals appear in the code map`);

  const bannerProbs = []; let pos = -1;
  sections.forEach(s=>{ const key = s.title.split(/\s[(—]/)[0]; const at = map.indexOf(key);
    if (at < 0) bannerProbs.push(`banner "${key}" is not in the code map`);
    else if (at < pos) bannerProbs.push(`banner "${key}" appears out of order in the code map`); else pos = at; });
  check('code-map-banners', bannerProbs, `${sections.length} section banners listed in source order`);

  // 9. Verification stamp.
  const hash = execFileSync('git', ['hash-object', TOOL], { cwd:ROOT }).toString().trim();
  const stampRe = /(\| `plew-map\.html` \| )(\d+)( \| `)([0-9a-f]{40})(` \| )([0-9-]+)( \|)/;
  if (args.includes('--stamp')){
    const today = new Date().toISOString().slice(0, 10);
    if (!stampRe.test(map)){ console.log('FAIL stamp | no stamp row found in ' + MAP); process.exit(1); }
    fs.writeFileSync(path.join(ROOT, MAP), map.replace(stampRe, `$1${lines.length}$3${hash}$5${today}$7`));
    console.log(`stamp written: ${lines.length} lines, ${hash}, ${today}`);
  } else {
    const m = map.match(stampRe);
    check('verification-stamp', !m ? ['no stamp row found in ' + MAP] : m[4] !== hash ? [
      `${TOOL} has changed since the documents were last verified.`,
      `stamped ${m[4]} (${m[6]}), now ${hash}.`,
      'Run the review in tools/code-userguide-review.md, then: node tools/checks/code-health.js --stamp'] : [], `documents verified against ${hash.slice(0, 12)}`);
  }
} else check('code-map-present', [MAP + ' not found'], '');

// 10. how-it-works.html names functions in its internals map; they must exist too.
if (fs.existsSync(path.join(ROOT, 'how-it-works.html'))){
  const how = read('how-it-works.html'), probs = [];
  const fnLists = [...how.matchAll(/'([A-Za-z0-9_#.· ]+)'\]/g)].map(m=>m[1]).concat([...how.matchAll(/<small>([^<]+)<\/small>/g)].map(m=>m[1]));
  fnLists.forEach(list=>list.split('·').map(x=>x.trim()).forEach(n=>{
    if (!/^[a-z][A-Za-z0-9]*$/.test(n) || n.length < 4) return;                   // skip S.fields, #ids, words
    if (!fnNames.has(n) && !sDeclared.has(n) && !['headers', 'data', 'cols', 'filters', 'media', 'view', 'labels', 'compare', 'basemaps'].includes(n)) probs.push(`how-it-works.html names ${n}, which is not in ${TOOL}`);
  }));
  check('how-it-works-names-exist', [...new Set(probs)], 'function names in the internals map exist');
}

// 11. Examples: every content page points at a manifest that exists, lists files that exist, and a setup that parses.
{ const probs = []; const dir = path.join(ROOT, 'content', 'examples'); let n = 0;
  fs.readdirSync(dir).filter(f=>f !== '_index.md').forEach(f=>{
    const t = fs.readFileSync(path.join(dir, f), 'utf8'); n++;
    const man = (t.match(/manifest\s*=\s*"([^"]+)"/) || [])[1], setup = (t.match(/setup\s*=\s*"([^"]+)"/) || [])[1];
    if (!man) return probs.push(`${f}: no manifest in front matter`);
    const mp = path.join(ROOT, 'static', man);
    if (!fs.existsSync(mp)) return probs.push(`${f}: manifest ${man} does not exist`);
    let m; try { m = JSON.parse(fs.readFileSync(mp, 'utf8')); } catch (e) { return probs.push(`${f}: ${man} is not valid JSON`); }
    if (!Array.isArray(m.files)) return probs.push(`${f}: ${man} has no "files" list`);
    m.files.forEach(x=>{ if (!fs.existsSync(path.join(path.dirname(mp), x))) probs.push(`${f}: ${man} lists ${x}, which does not exist`); });
    if (setup){ const sp = path.join(ROOT, 'static', setup);
      if (!fs.existsSync(sp)) probs.push(`${f}: setup ${setup} does not exist`);
      else try { const s = JSON.parse(fs.readFileSync(sp, 'utf8')); if (Array.isArray(s.files)) probs.push(`${f}: setup ${setup} looks like a manifest`); } catch (e) { probs.push(`${f}: ${setup} is not valid JSON`); } }
  });
  check('examples-consistent', probs, `${n} example pages, manifests and setups in place`); }

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
