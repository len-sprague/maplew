#!/usr/bin/env node
/*
 * Behaviour and break tests for plew-map.html.
 *
 *   node tools/checks/behaviour.js                 # test the working tree
 *   node tools/checks/behaviour.js --html old.html # test another copy of the tool file
 *   node tools/checks/behaviour.js --only B1       # run checks whose id starts with B1
 *   node tools/checks/behaviour.js --big           # also run the slow 200,000-row checks
 *
 * Needs Node 18+ and Playwright (`npm i playwright && npx playwright install chromium`).
 * No Hugo needed: example pages are exercised by setting window.PLEW_EXAMPLE the way
 * layouts/_default/example-map.html does, against the files in static/examples/.
 *
 * Output: one line per check.
 *   PASS <id> | <what was observed>
 *   FAIL <id> | <what was observed> | expected <what should have been>
 *   INFO <id> | <timings and other numbers that vary from run to run>
 * PASS/FAIL lines contain no timings, so two runs can be compared with `diff`
 * (see "Record, then diff" in tools/code-userguide-review.md). Exit code 1 if any FAIL.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const argVal = (flag)=>{ const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const HTML = path.resolve(argVal('--html') || path.join(ROOT, 'plew-map.html'));
const ONLY = argVal('--only');
const BIG = args.includes('--big');

let playwright;
try { playwright = require('playwright'); }
catch (e) { console.error('Playwright is not installed. Run: npm i playwright && npx playwright install chromium'); process.exit(2); }

// ── tiny static server: repo root, with /__tool.html mapped to the file under test ──
const MIME = { '.html':'text/html', '.json':'application/json', '.csv':'text/csv', '.png':'image/png', '.jpg':'image/jpeg',
  '.wav':'audio/wav', '.flac':'audio/flac', '.txt':'text/plain', '.eaf':'application/xml', '.TextGrid':'text/plain' };
const serverLog = { inFlight:0, maxInFlight:0, order:[] };
const server = http.createServer((req, res)=>{
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url.startsWith('/__fixture/')) return fixture(url, res);
  const file = url === '/__tool.html' ? HTML : path.join(ROOT, url);
  if (!file.startsWith(ROOT) && file !== HTML) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf)=>{
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
// Synthetic example dataset used by the P2 checks. Each file is held for 120 ms so that
// overlapping requests are visible in serverLog.maxInFlight.
const FIX_FILES = ['a.csv', 'm1.wav', 'm2.wav', 'm3.wav', 'm4.wav', 'm5.wav', 'm6.wav', 'm7.wav'];
const FIX_FILES_JOINED = FIX_FILES.join(',');
function fixture(url, res){
  const name = url.replace('/__fixture/', '');
  const send = (code, body, type)=>{ res.writeHead(code, { 'Content-Type': type || 'text/plain' }); res.end(body); };
  if (name === 'ok/manifest.json') return send(200, JSON.stringify({ files: FIX_FILES }), 'application/json');
  if (name === 'missing/manifest.json') return send(200, JSON.stringify({ files: ['a.csv', 'gone.wav', 'm1.wav'] }), 'application/json');
  if (name === 'nofiles/manifest.json') return send(200, JSON.stringify({ version: 1, locX: 'x' }), 'application/json');
  const base = name.split('/').pop();
  if (base === 'gone.wav') return send(404, 'nope');
  serverLog.inFlight++; serverLog.maxInFlight = Math.max(serverLog.maxInFlight, serverLog.inFlight);
  serverLog.order.push(base);
  setTimeout(()=>{
    serverLog.inFlight--;
    if (base === 'a.csv') return send(200, 'name,loc::x,loc::y,med::audio\nA,1,2,m1.wav\nB,3,4,m2.wav\nC,5,6,m7.wav', 'text/csv');
    send(200, Buffer.alloc(64), 'audio/wav');
  }, 120);
}

const results = [];
function report(kind, id, observed, expected){
  const line = `${kind} ${id} | ${observed}` + (kind === 'FAIL' && expected ? ` | expected ${expected}` : '');
  results.push({ kind, id }); console.log(line);
}
const hash = (s)=>crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

(async ()=>{
  await new Promise(r=>server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch();

  // Open the tool. `boot` is JS run before the page's own script (as the Hugo layouts do).
  async function open(boot){
    const page = await browser.newPage({ viewport:{ width:1400, height:900 } });
    page.errors = [];
    page.on('pageerror', e=>page.errors.push(e.message));
    page.on('dialog', d=>d.accept());
    await page.route('**/cdnjs.cloudflare.com/**', r=>r.abort());   // html2canvas: keep runs offline and identical
    if (boot) await page.addInitScript(boot);
    await page.goto(BASE + '/__tool.html');
    // Helpers available to every check, inside the page.
    await page.evaluate(()=>{
      window.T = {
        wait: (ms)=>new Promise(r=>setTimeout(r, ms)),
        csvFile: (text, name)=>new File([text], name || 'data.csv'),
        async png(name, w, h){
          const cv = document.createElement('canvas'); cv.width = w || 400; cv.height = h || 300;
          const g = cv.getContext('2d'); g.fillStyle = '#ccddee'; g.fillRect(0, 0, cv.width, cv.height);
          const blob = await new Promise(r=>cv.toBlob(r, 'image/png'));
          return new File([blob], name || 'map.png', { type:'image/png' });
        },
        async frame(){ useBlankFrame(); await T.wait(250); },
        pts: ()=>document.querySelectorAll('#overlay .pt-shape').length,
        inFrame(){   // points whose centre lies inside the image
          let n = 0;
          document.querySelectorAll('#overlay .pt-shape').forEach(el=>{
            const b = el.getBBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
            if (x >= 0 && x <= S.imgW && y >= 0 && y <= S.imgH) n++;
          });
          return n;
        },
        edges: ()=>JSON.stringify(S.calib.edges),
        edgeInputs: ()=>['edgeL','edgeR','edgeT','edgeB'].map(id=>document.getElementById(id).value).join(','),
        type(id, v){ const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change')); },
        select(id, v){ const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change')); },
        status: (id)=>document.getElementById(id).className + ': ' + document.getElementById(id).textContent,
        svg: ()=>document.getElementById('overlay').innerHTML,
        visible: (id)=>getComputedStyle(document.getElementById(id)).display !== 'none'
      };
    });
    return page;
  }
  async function waitExample(page){
    await page.waitForFunction(()=>!document.getElementById('datasetLoadingBanner').classList.contains('active'), null, { timeout:180000 });
    await page.waitForTimeout(400);
  }
  async function check(id, expected, fn){
    if (ONLY && !id.startsWith(ONLY)) return;
    let page;
    try {
      const out = await fn(async (boot)=>(page = await open(boot)));
      const observed = typeof out.observed === 'string' ? out.observed : JSON.stringify(out.observed);
      const errs = page && page.errors.length ? ` | page errors: ${page.errors.join('; ')}` : '';
      report(out.ok && !errs ? 'PASS' : 'FAIL', id, observed + errs, expected);
      if (out.info) report('INFO', id, out.info);
    } catch (e) {
      report('FAIL', id, 'check threw: ' + String(e.message).split('\n')[0], expected);
    } finally { if (page) await page.close(); }
  }

  const TABLE_A = 'name,loc::x,loc::y,dim::g\nA,1,2,u\nB,3,4,v\nC,2,3,u';
  const TABLE_B = 'name,loc::x,loc::y,dim::g\nA,1000,2000,u\nB,3000,4000,v\nC,2000,3000,u';

  // ════════ SMOKE: the editor and every example still work ════════
  await check('SMOKE-open', 'no errors, empty state shown', async (open)=>{
    const p = await open();
    const o = await p.evaluate(()=>({ empty:T.visible('emptyState'), stage:T.visible('mapStage') }));
    return { ok:o.empty && !o.stage, observed:o };
  });
  for (const [id, fn, n] of [['SMOKE-demo-atlas', 'loadDemoALI', 24], ['SMOKE-demo-toeic', 'loadDemoTOEIC', 90]]){
    await check(id, `${n} points, all inside the image, calibration not prefilled`, async (open)=>{
      const p = await open();
      const o = await p.evaluate(async (fn)=>{ window[fn](); await T.wait(500);
        return { pts:T.pts(), inFrame:T.inFrame(), prefilled:S.calib.prefilled, edges:T.edges(), svg:T.svg() }; }, fn);
      return { ok:o.pts === n && o.inFrame === n && o.prefilled === false, observed:{ pts:o.pts, inFrame:o.inFrame, prefilled:o.prefilled, edges:o.edges, svg:hash(o.svg) } };
    });
  }
  const EXAMPLES = fs.readdirSync(path.join(ROOT, 'content', 'examples')).filter(f=>f !== '_index.md').map(f=>{
    const t = fs.readFileSync(path.join(ROOT, 'content', 'examples', f), 'utf8');
    const m = t.match(/manifest\s*=\s*"([^"]+)"/), s = t.match(/setup\s*=\s*"([^"]+)"/);
    return { page:f.replace(/\.md$/, ''), manifest:m && m[1], setup:s && s[1] };
  }).filter(e=>e.manifest).sort((a, b)=>a.page.localeCompare(b.page));
  for (const ex of EXAMPLES){
    await check('SMOKE-example-' + ex.page, 'loads without error; every row with numeric coordinates is drawn or filtered', async (open)=>{
      const boot = `window.PLEW_HUGO=true;window.PLEW_EXAMPLE=${JSON.stringify('static/' + ex.manifest)};` + (ex.setup ? `window.PLEW_SETUP=${JSON.stringify('static/' + ex.setup)};` : '');
      const p = await open(boot); await waitExample(p);
      const o = await p.evaluate(()=>({ rows:S.data.length, pts:T.pts(), inFrame:T.inFrame(), hidden:S.data.filter(r=>!rowVisible(r)).length, skipped:S.skipped,
        valid:S.calib.valid, prefilled:S.calib.prefilled, edges:T.edges(), basemaps:S.basemaps.length, media:Object.keys(S.media).length,
        align:Object.keys(S.alignFiles).length, input:document.getElementById('inputStatus').className, svg:T.svg() }));
      const ok = o.rows > 0 && o.valid && o.pts > 0 && o.pts + o.hidden + o.skipped >= o.rows && !/err/.test(o.input);
      const { svg, ...rest } = o;
      return { ok, observed:{ ...rest, svg:hash(svg) } };
    });
  }
  await check('SMOKE-record-and-edit', 'record opens; edit, undo and redo change and restore the value', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async (csv)=>{
      await handleFiles([T.csvFile(csv)]); await T.frame();
      document.querySelector('#overlay .pt-shape').dispatchEvent(new MouseEvent('click', { bubbles:true }));
      const modalOpen = document.getElementById('modalOverlay').classList.contains('active');
      const title = document.getElementById('modalTitle').textContent;
      openRecordEditor(S.data[0]);
      document.querySelector('#recordEditorForm [name="dim::g"]').value = 'w';
      document.getElementById('recordEditorForm').dispatchEvent(new Event('submit', { cancelable:true }));
      const edited = S.data[0]['dim::g']; undo(); const undone = S.data[0]['dim::g']; redo(); const redone = S.data[0]['dim::g'];
      return { modalOpen, title, edited, undone, redone, pts:T.pts(), legend:legendCategories('dim::g').join('/') };
    }, TABLE_A);
    return { ok:o.modalOpen && o.edited === 'w' && o.undone === 'u' && o.redone === 'w' && o.pts === 3, observed:o };
  });
  await check('SMOKE-save-reload', 'saved CSV reloads with the same rows and the same calibration, not prefilled', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async (csv)=>{
      await handleFiles([T.csvFile(csv)]); await T.frame();
      T.type('edgeL', 0); T.type('edgeR', 10); T.type('edgeT', 10); T.type('edgeB', 0);
      const saved = generateCSV();
      await handleFiles([T.csvFile(saved, 'data-calibrated.csv')]); await T.wait(100);
      return { rows:S.data.length, edges:T.edges(), prefilled:S.calib.prefilled, pts:T.pts(), inFrame:T.inFrame() };
    }, TABLE_A);
    return { ok:o.rows === 3 && o.edges === '{"L":0,"R":10,"T":10,"B":0}' && o.prefilled === false && o.inFrame === 3, observed:o };
  });
  await check('SMOKE-setup-roundtrip', 'exported setup re-applies encodings, filters and calibration', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async (csv)=>{
      await handleFiles([T.csvFile(csv)]); await T.frame();
      T.type('edgeL', 0); T.type('edgeR', 10); T.type('edgeT', 10); T.type('edgeB', 0);
      T.select('colorSel', 'dim::g'); T.select('shapeSel', 'dim::g'); setFilter('dim::g', 'v', false);
      const cfg = JSON.parse(JSON.stringify(buildVisualizationConfig()));
      await handleFiles([T.csvFile(csv)]); await T.wait(100);
      const fresh = { edges:T.edges(), pts:T.pts() };
      applyVisualizationConfig(cfg);
      return { fresh, edges:T.edges(), prefilled:S.calib.prefilled, pts:T.pts(), color:S.enc.color.col, shape:S.enc.shape.col, vOn:isFilterOn('dim::g', 'v') };
    }, TABLE_A);
    return { ok:o.edges === '{"L":0,"R":10,"T":10,"B":0}' && o.pts === 2 && o.color === 'dim::g' && o.vOn === false && o.prefilled === false, observed:o };
  });

  // ════════ LEGMIN: the on-map legend's minimised state travels in the setup file ════════
  const legendState = ()=>{
    const panel = document.getElementById('mapLegendPanel'), btn = document.getElementById('mapLegendToggleBtn');
    return { shown:panel.classList.contains('visible'), minimized:panel.classList.contains('minimized'), state:S.legendPanelMinimized, btn:btn.textContent };
  };
  await check('LEGMIN-setup-roundtrip', 'a setup saved with the legend minimised re-applies it minimised (+ button); one saved expanded expands it', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ({ csv, fnSrc })=>{
      const st = eval('(' + fnSrc + ')');
      await handleFiles([T.csvFile(csv)]); await T.frame(); T.select('colorSel', 'dim::g');
      toggleMapLegend();
      const minCfg = JSON.parse(JSON.stringify(buildVisualizationConfig()));
      toggleMapLegend();
      const openCfg = JSON.parse(JSON.stringify(buildVisualizationConfig()));
      applyVisualizationConfig(minCfg); const afterMin = st();
      applyVisualizationConfig(openCfg); const afterOpen = st();
      return { saved:[minCfg.display.mapLegendMinimized, openCfg.display.mapLegendMinimized], afterMin, afterOpen };
    }, { csv:TABLE_A, fnSrc:legendState.toString() });
    const ok = o.saved[0] === true && o.saved[1] === false
      && o.afterMin.shown && o.afterMin.minimized && o.afterMin.state === true && o.afterMin.btn === '+'
      && o.afterOpen.shown && !o.afterOpen.minimized && o.afterOpen.state === false && o.afterOpen.btn === '−';
    return { ok, observed:o };
  });
  await check('LEGMIN-old-setup-leaves-state', 'a setup file without the field leaves the legend as the user has it', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ({ csv, fnSrc })=>{
      const st = eval('(' + fnSrc + ')');
      await handleFiles([T.csvFile(csv)]); await T.frame(); T.select('colorSel', 'dim::g');
      const cfg = JSON.parse(JSON.stringify(buildVisualizationConfig())); delete cfg.display.mapLegendMinimized;
      applyVisualizationConfig(cfg); const fromOpen = st();
      toggleMapLegend(); applyVisualizationConfig(cfg); const fromMin = st();
      return { fromOpen, fromMin };
    }, { csv:TABLE_A, fnSrc:legendState.toString() });
    return { ok:!o.fromOpen.minimized && o.fromMin.minimized && o.fromMin.btn === '+', observed:o };
  });
  for (const ex of EXAMPLES.filter(e=>/^isaph-/.test(e.page))){
    await check('LEGMIN-example-' + ex.page, 'example opens with the on-map legend shown and minimised', async (open)=>{
      const boot = `window.PLEW_HUGO=true;window.PLEW_EXAMPLE=${JSON.stringify('static/' + ex.manifest)};` + (ex.setup ? `window.PLEW_SETUP=${JSON.stringify('static/' + ex.setup)};` : '');
      const p = await open(boot); await waitExample(p);
      const o = await p.evaluate(`(${legendState.toString()})()`);
      return { ok:o.shown && o.minimized && o.state === true && o.btn === '+', observed:o };
    });
  }

  // ════════ B1: edge values after a new table or a change of X / Y ════════
  await check('B1-second-table-on-frame', 'second table gets a fresh guess; all 3 points inside the frame', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ([a, b])=>{
      await handleFiles([T.csvFile(a, 'a.csv')]); await T.frame();
      const first = { edges:T.edges(), inFrame:T.inFrame() };
      await handleFiles([T.csvFile(b, 'b.csv')]); await T.wait(100);
      return { first, edges:T.edges(), inputs:T.edgeInputs(), pts:T.pts(), inFrame:T.inFrame(), prefilled:S.calib.prefilled };
    }, [TABLE_A, TABLE_B]);
    return { ok:o.first.inFrame === 3 && o.inFrame === 3 && o.prefilled === true && o.edges === '{"L":880,"R":3120,"T":4120,"B":1880}', observed:o };
  });
  await check('B1-own-table-after-demo', 'a table dropped after a demo is visible (demo edges are discarded)', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async (b)=>{
      loadDemoTOEIC(); await T.wait(500);
      await handleFiles([T.csvFile(b, 'b.csv')]); await T.wait(100);
      return { edges:T.edges(), pts:T.pts(), inFrame:T.inFrame(), prefilled:S.calib.prefilled };
    }, TABLE_B);
    return { ok:o.inFrame === 3 && o.prefilled === true, observed:o };
  });
  await check('B1-change-x-prefilled', 'changing X while edges are still the prefill re-guesses them; points stay visible', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ()=>{
      await handleFiles([T.csvFile('name,loc::a,loc::b,big\nA,1,2,1000\nB,3,4,3000\nC,2,3,2000')]); await T.frame();
      const before = { edges:T.edges(), inFrame:T.inFrame() };
      T.select('locXSel', 'big');
      return { before, edges:T.edges(), inFrame:T.inFrame(), prefilled:S.calib.prefilled };
    });
    return { ok:o.before.inFrame === 3 && o.inFrame === 3 && o.prefilled === true && /"L":880/.test(o.edges), observed:o };
  });
  await check('B1-change-x-typed', 'changing X after typing edges keeps the typed values', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ()=>{
      await handleFiles([T.csvFile('name,loc::a,loc::b,big\nA,1,2,1000\nB,3,4,3000\nC,2,3,2000')]); await T.frame();
      T.type('edgeL', 0); T.type('edgeR', 10); T.type('edgeT', 10); T.type('edgeB', 0);
      T.select('locXSel', 'big');
      return { edges:T.edges(), prefilled:S.calib.prefilled };
    });
    return { ok:o.edges === '{"L":0,"R":10,"T":10,"B":0}' && o.prefilled === false, observed:o };
  });
  await check('B1-reset-after-typed', 'Reset to defaults after a column change gives the guess for the new columns', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ()=>{
      await handleFiles([T.csvFile('name,loc::a,loc::b,big\nA,1,2,1000\nB,3,4,3000\nC,2,3,2000')]); await T.frame();
      T.type('edgeL', 0); T.select('locXSel', 'big'); resetCalibration();
      return { edges:T.edges(), inFrame:T.inFrame(), prefilled:S.calib.prefilled };
    });
    return { ok:o.inFrame === 3 && o.prefilled === true && /"L":880/.test(o.edges), observed:o };
  });
  await check('B1-new-table-keeps-typed-edges-on-real-image', 'typed edges for a dropped image survive a new table (they describe the image)', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ([a, b])=>{
      await handleFiles([T.csvFile(a, 'a.csv'), await T.png('map.png')]); await T.wait(300);
      T.type('edgeL', 0); T.type('edgeR', 5000); T.type('edgeT', 5000); T.type('edgeB', 0);
      await handleFiles([T.csvFile(b, 'b.csv')]); await T.wait(100);
      return { edges:T.edges(), inFrame:T.inFrame(), prefilled:S.calib.prefilled, basemap:S.activeBasemapId };
    }, [TABLE_A, TABLE_B]);
    return { ok:o.edges === '{"L":0,"R":5000,"T":5000,"B":0}' && o.inFrame === 3 && o.prefilled === false, observed:o };
  });
  await check('B1-new-table-reguesses-prefill-on-real-image', 'prefilled edges on a dropped image are re-guessed for a new table', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ([a, b])=>{
      await handleFiles([T.csvFile(a, 'a.csv'), await T.png('map.png')]); await T.wait(300);
      await handleFiles([T.csvFile(b, 'b.csv')]); await T.wait(100);
      return { edges:T.edges(), inFrame:T.inFrame(), prefilled:S.calib.prefilled };
    }, [TABLE_A, TABLE_B]);
    return { ok:o.inFrame === 3 && o.prefilled === true && /"L":880/.test(o.edges), observed:o };
  });
  await check('B1-sidecar-wins-and-survives-new-table', 'sidecar edges apply, are not prefilled, and survive a new table on the same image', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ([a, b])=>{
      const side = new File(['L: 0\nR: 4000\nT: 5000\nB: 0\nMercator Y: OFF'], 'map.png.calib.txt');
      await handleFiles([T.csvFile(a, 'a.csv'), await T.png('map.png'), side]); await T.wait(300);
      const first = { edges:T.edges(), prefilled:S.calib.prefilled };
      await handleFiles([T.csvFile(b, 'b.csv')]); await T.wait(100);
      return { first, edges:T.edges(), inFrame:T.inFrame(), prefilled:S.calib.prefilled };
    }, [TABLE_A, TABLE_B]);
    const want = '{"L":0,"R":4000,"T":5000,"B":0}';
    return { ok:o.first.edges === want && o.first.prefilled === false && o.edges === want && o.inFrame === 3, observed:o };
  });
  await check('B1-embedded-row-after-other-table', 'a CSV with an embedded calibration row uses its own edges, whatever was loaded before', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async (a)=>{
      await handleFiles([T.csvFile(a, 'a.csv')]); await T.frame();
      const csv = 'name,loc::x,loc::y\nA,100,200\nB,300,400\n__PLEWMAP_CALIB__,"{""mode"":""edges"",""mercator"":false,""locX"":""loc::x"",""locY"":""loc::y"",""L"":0,""R"":500,""T"":500,""B"":0}",';
      await handleFiles([T.csvFile(csv, 'c.csv')]); await T.wait(100);
      return { rows:S.data.length, edges:T.edges(), inFrame:T.inFrame(), prefilled:S.calib.prefilled };
    }, TABLE_A);
    return { ok:o.rows === 2 && o.edges === '{"L":0,"R":500,"T":500,"B":0}' && o.inFrame === 2 && o.prefilled === false, observed:o };
  });
  await check('B1-record-save-does-not-rescale', 'saving a record after dragging a point outside the old range leaves prefilled edges alone', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async (a)=>{
      await handleFiles([T.csvFile(a, 'a.csv')]); await T.frame();
      const before = T.edges();
      S.data[0]['loc::x'] = '50';                       // as a drag would write it
      openRecordEditor(S.data[1]);
      document.getElementById('recordEditorForm').dispatchEvent(new Event('submit', { cancelable:true }));
      return { before, after:T.edges() };
    }, TABLE_A);
    return { ok:o.before === o.after, observed:o };
  });
  await check('B1-basemap-roundtrip-stays-prefilled', 'switching between two images without sidecars keeps the prefill state, so a later X change still re-guesses', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ()=>{
      await handleFiles([T.csvFile('name,loc::a,loc::b,big\nA,1,2,1000\nB,3,4,3000\nC,2,3,2000'), await T.png('one.png'), await T.png('two.png')]); await T.wait(300);
      const first = S.activeBasemapId, other = S.basemaps.find(b=>b.id !== first).id;
      switchBasemap(other); await T.wait(300); switchBasemap(first); await T.wait(300);
      const prefilledAfterTrip = S.calib.prefilled;
      T.select('locXSel', 'big');
      return { prefilledAfterTrip, edges:T.edges(), inFrame:T.inFrame() };
    });
    return { ok:o.prefilledAfterTrip === true && o.inFrame === 3, observed:o };
  });
  await check('B1-basemap-switch-remembers-typed-edges', 'edges typed for one image come back when you switch back to it', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async (a)=>{
      await handleFiles([T.csvFile(a, 'a.csv'), await T.png('one.png'), await T.png('two.png')]); await T.wait(300);
      const first = S.activeBasemapId, other = S.basemaps.find(b=>b.id !== first).id;
      T.type('edgeL', 0); T.type('edgeR', 10); T.type('edgeT', 10); T.type('edgeB', 0);
      switchBasemap(other); await T.wait(300);
      T.type('edgeL', -5);
      switchBasemap(first); await T.wait(300);
      return { edges:T.edges(), prefilled:S.calib.prefilled };
    }, TABLE_A);
    return { ok:o.edges === '{"L":0,"R":10,"T":10,"B":0}' && o.prefilled === false, observed:o };
  });
  await check('B1-single-column-table', 'a table with one column loads without error and does not inherit typed edge values', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async (a)=>{
      await handleFiles([T.csvFile(a, 'a.csv')]); await T.frame();
      T.type('edgeL', 777);
      await handleFiles([T.csvFile('loc::only\n5\n7', 'one.csv')]); await T.wait(100);
      return { inputs:T.edgeInputs(), rows:S.data.length };
    }, TABLE_A);
    return { ok:o.rows === 2 && !/777/.test(o.inputs), observed:o };
  });

  // ════════ P1: redraw cost and identical output ════════
  // Rows are wrapped in a Proxy that counts reads of the encoded columns. One redraw should
  // read each encoded cell a small, fixed number of times, not once per row per row.
  const P1_N = 300;
  for (const mode of ['continuous', 'categorical']){
    await check('P1-reads-' + mode, `fewer than ${20 * P1_N} reads of the encoded columns in one redraw of ${P1_N} rows`, async (open)=>{
      const p = await open();
      const o = await p.evaluate(async ([N, mode])=>{
        const lines = ['name,loc::x,loc::y,dim::score,dim::weight,dim::group'];
        for (let i = 0; i < N; i++) lines.push(`p${i},${(i * 37) % 101},${(i * 53) % 97},${(i * 7) % 50},${(i * 3) % 9},g${i % 8}`);
        await handleFiles([T.csvFile(lines.join('\n'))]); await T.frame();
        if (mode === 'continuous'){ T.select('colorSel', 'dim::score'); setEncType('color', 'continuous'); T.select('sizeSel', 'dim::weight'); setEncType('size', 'continuous'); T.select('shapeSel', ''); }
        else { T.select('colorSel', 'dim::group'); T.select('sizeSel', 'dim::group'); T.select('shapeSel', 'dim::group'); }
        const svgPlain = T.svg();
        let reads = 0; const watched = new Set(['dim::score', 'dim::weight', 'dim::group']);
        S.data = S.data.map(r=>new Proxy(r, { get(t, k){ if (watched.has(k)) reads++; return t[k]; } }));
        renderAll();
        return { reads, pts:T.pts(), same:T.svg() === svgPlain, svg:svgPlain, enc:[S.enc.color.type, S.enc.size.type, S.enc.shape.col].join('/') };
      }, [P1_N, mode]);
      return { ok:o.reads < 20 * P1_N && o.pts === P1_N && o.same, observed:{ readsPerRow:Math.round(o.reads / P1_N), pts:o.pts, enc:o.enc, svg:hash(o.svg) } };
    });
  }
  await check('P1-range-follows-edits', 'continuous colour uses the current min and max after an edit, undo and filter change', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ()=>{
      await handleFiles([T.csvFile('name,loc::x,loc::y,dim::v,dim::g\nA,1,1,10,u\nB,2,2,20,u\nC,3,3,30,v')]); await T.frame();
      T.select('colorSel', 'dim::v'); setEncType('color', 'continuous'); T.select('shapeSel', 'dim::g');
      const fills = ()=>[...document.querySelectorAll('#overlay .pt-shape')].map(e=>e.getAttribute('fill')).join(' ');
      const r0 = colRange('dim::v').join('-'), f0 = fills();
      openRecordEditor(S.data[2]);
      document.querySelector('#recordEditorForm [name="dim::v"]').value = '100';
      document.getElementById('recordEditorForm').dispatchEvent(new Event('submit', { cancelable:true }));
      const r1 = colRange('dim::v').join('-'), f1 = fills();
      undo(); const r2 = colRange('dim::v').join('-'), f2 = fills();
      setFilter('dim::g', 'v', false); const r3 = colRange('dim::v').join('-'), n3 = T.pts();
      return { r0, r1, r2, r3, n3, midChanged:f0.split(' ')[1] !== f1.split(' ')[1], undoRestores:f0 === f2 };
    });
    return { ok:o.r0 === '10-30' && o.r1 === '10-100' && o.r2 === '10-30' && o.r3 === '10-30' && o.n3 === 2 && o.midChanged && o.undoRestores, observed:o };
  });
  await check('P1-legend-override-for-absent-value', 'a custom colour for a value no row has stays in the legend and does not shift other colours', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async (a)=>{
      await handleFiles([T.csvFile(a)]); await T.frame();
      T.select('colorSel', 'dim::g');
      const before = [...document.querySelectorAll('#overlay .pt-shape')].map(e=>e.getAttribute('fill')).join(' ');
      setCatColor('zz', '#123456');
      const after = [...document.querySelectorAll('#overlay .pt-shape')].map(e=>e.getAttribute('fill')).join(' ');
      return { cats:legendCategories('dim::g').join('/'), same:before === after, legendRows:document.querySelectorAll('#legendBody .legend-item').length };
    }, TABLE_A);
    return { ok:o.cats === 'u/v/zz' && o.same && o.legendRows >= 3, observed:o };
  });
  await check('P1-edge-values', 'empty cells, a constant column and text in a numeric encoding draw without error', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ()=>{
      await handleFiles([T.csvFile('name,loc::x,loc::y,dim::same,dim::gaps\nA,1,1,5,\nB,2,2,5,7\nC,3,3,5,9')]); await T.frame();
      T.select('colorSel', 'dim::same'); setEncType('color', 'continuous'); T.select('sizeSel', 'dim::gaps'); setEncType('size', 'continuous');
      const fills = [...document.querySelectorAll('#overlay .pt-shape')].map(e=>e.getAttribute('fill'));
      return { pts:T.pts(), same:colRange('dim::same').join('-'), gaps:colRange('dim::gaps').join('-'), text:colRange('name').join('-'), oneFill:new Set(fills).size };
    });
    // An empty cell counts as 0 (Number('') === 0): unchanged, long-standing behaviour.
    return { ok:o.pts === 3 && o.same === '5-5' && o.gaps === '0-9' && o.text === '0-1' && o.oneFill === 1, observed:o };
  });
  await check('P1-header-only-and-empty', 'a header-only file and an empty file do not throw', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ()=>{
      await handleFiles([T.csvFile('name,loc::x,loc::y', 'h.csv')]); const a = S.data.length;
      await handleFiles([T.csvFile('', 'e.csv')]); const b = S.data.length;
      await handleFiles([T.csvFile('name,loc::x,loc::y\nA,1,2', 'one.csv')]); await T.frame();
      return { a, b, pts:T.pts(), inFrame:T.inFrame() };
    });
    return { ok:o.a === 0 && o.b === 0 && o.pts === 1 && o.inFrame === 1, observed:o };
  });
  await check('P1-timing', 'reported only (INFO line)', async (open)=>{
    const p = await open();
    const o = await p.evaluate(async ()=>{
      const N = 5000, lines = ['name,loc::x,loc::y,dim::score,dim::weight'];
      for (let i = 0; i < N; i++) lines.push(`p${i},${(i * 37) % 1009},${(i * 53) % 997},${(i * 7) % 50},${(i * 3) % 9}`);
      await handleFiles([T.csvFile(lines.join('\n'))]); await T.frame();
      S.enc.color.col = 'dim::score'; S.enc.color.type = 'continuous'; S.enc.size.col = 'dim::weight'; S.enc.size.type = 'continuous'; S.enc.shape.col = '';
      populateEncSelectors();
      const t = performance.now(); renderAll(); const ms = performance.now() - t;
      return { pts:T.pts(), ms:Math.round(ms) };
    });
    return { ok:o.pts === 5000, observed:{ pts:o.pts }, info:`one redraw, 5,000 rows, continuous colour + size: ${o.ms} ms` };
  });
  if (BIG){
    await check('B3-200k-rows', '200,000 rows load and draw without a RangeError', async (open)=>{
      const p = await open();
      const o = await p.evaluate(async ()=>{
        const lines = ['name,loc::x,loc::y,dim::v'];
        for (let i = 0; i < 200000; i++) lines.push(`p${i},${i % 977},${i % 613},${i % 50}`);
        let err = null; const t = performance.now();
        try { await handleFiles([T.csvFile(lines.join('\n'))]); } catch (e) { err = e.name + ': ' + e.message; }
        const tLoad = performance.now() - t;
        return { err, rows:S.data.length, range:colRange('loc::x').join('-'), tLoad:Math.round(tLoad) };
      });
      return { ok:!o.err && o.rows === 200000 && o.range === '0-976', observed:{ err:o.err, rows:o.rows, range:o.range }, info:`200,000-row load: ${o.tLoad} ms` };
    });
  }

  // ════════ P2: example files fetched several at a time ════════
  await check('P2-parallel-and-complete', 'more than one request in flight; every file arrives; media keyed by name', async (open)=>{
    serverLog.maxInFlight = 0; serverLog.order = [];
    const p = await open(`window.PLEW_HUGO=true;window.PLEW_EXAMPLE='/__fixture/ok/manifest.json';`); await waitExample(p);
    const o = await p.evaluate(()=>({ rows:S.data.length, media:Object.keys(S.media).sort().join(','), pts:T.pts(), frame:S.isFrame, input:document.getElementById('inputStatus').className }));
    const ok = serverLog.maxInFlight > 1 && serverLog.maxInFlight <= 6 && o.rows === 3 && o.media === 'm1.wav,m2.wav,m3.wav,m4.wav,m5.wav,m6.wav,m7.wav' && o.pts === 3 && o.frame;
    return { ok, observed:{ ...o, parallel:serverLog.maxInFlight > 1, withinLimit:serverLog.maxInFlight <= 6, requests:serverLog.order.length }, info:`max requests in flight: ${serverLog.maxInFlight}` };
  });
  await check('P2-missing-file', 'one missing file gives the "Could not load" message, hides the banner and leaves no table half-loaded', async (open)=>{
    const p = await open(`window.PLEW_HUGO=true;window.PLEW_EXAMPLE='/__fixture/missing/manifest.json';`);
    p.on('console', ()=>{}); await waitExample(p);
    const o = await p.evaluate(()=>({ status:T.status('inputStatus'), rows:S.data.length, banner:document.getElementById('datasetLoadingBanner').classList.contains('active') }));
    return { ok:/err: Could not load the example dataset/.test(o.status) && o.rows === 0 && !o.banner, observed:o };
  });
  await check('P2-setup-json-as-manifest', 'a manifest without a files list gives the "Could not load" message', async (open)=>{
    const p = await open(`window.PLEW_HUGO=true;window.PLEW_EXAMPLE='/__fixture/nofiles/manifest.json';`); await waitExample(p);
    const o = await p.evaluate(()=>({ status:T.status('inputStatus'), rows:S.data.length }));
    return { ok:/err: Could not load the example dataset/.test(o.status) && o.rows === 0, observed:o };
  });
  await check('P2-order-kept', 'files reach handleFiles in manifest order even though they arrive out of order', async (open)=>{
    const p = await open(`window.PLEW_HUGO=true;window.PLEW_EXAMPLE='/__fixture/ok/manifest.json';
      document.addEventListener('DOMContentLoaded',()=>{const o=window.handleFiles;window.handleFiles=function(f){window.__order=[...f].map(x=>x.name).join(',');return o.apply(this,arguments);};});`);
    await waitExample(p);
    const o = await p.evaluate(()=>window.__order);
    return { ok:o === FIX_FILES_JOINED, observed:o };
  });

  await browser.close(); server.close();
  const fails = results.filter(r=>r.kind === 'FAIL').length, passes = results.filter(r=>r.kind === 'PASS').length;
  console.log(`\n${passes} passed, ${fails} failed` + (BIG ? '' : ' (slow 200,000-row check skipped; add --big)'));
  process.exit(fails ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(2); });
