#!/usr/bin/env node
/*
 * Link check on a built site, served under a sub-folder the way GitHub Pages serves it.
 *
 *   hugo --destination /tmp/maplew-site --baseURL http://127.0.0.1:8770/maplew/ --cleanDestinationDir
 *   node tools/checks/links.js /tmp/maplew-site
 *
 * Opens the editor, the gallery, every guide page and one example in a browser, and for every
 * <a href> as the browser resolves it checks that: a same-host link stays inside the sub-folder,
 * answers 200, and (if it has a #fragment) the target page has an element with that id; a link to
 * a file of this repository on GitHub names a path that exists in the working tree.
 * Also checks that the tool's sidebar links, which are added by script, are present.
 * Other outside links are listed, not fetched. Needs Node 18+ and Playwright. Exit code 1 on any FAIL.
 */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SITE = path.resolve(process.argv[2] || '');
const SUB = '/maplew/', PORT = 8770;
if (!process.argv[2] || !fs.existsSync(path.join(SITE, 'index.html'))){ console.error('usage: node tools/checks/links.js <built site folder>'); process.exit(2); }
let playwright; try { playwright = require('playwright'); } catch (e) { console.error('Playwright is not installed.'); process.exit(2); }

const server = http.createServer((req, res)=>{
  let u = decodeURIComponent(req.url.split(/[?#]/)[0]);
  if (!u.startsWith(SUB)){ res.writeHead(404); return res.end('outside the site folder'); }
  let f = path.join(SITE, u.slice(SUB.length)); if (u.endsWith('/')) f = path.join(f, 'index.html');
  fs.readFile(f, (err, buf)=>{ if (err){ res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(buf); });
});

(async ()=>{
  await new Promise(r=>server.listen(PORT, '127.0.0.1', r));
  const base = `http://127.0.0.1:${PORT}${SUB}`;
  const firstExample = fs.readdirSync(path.join(SITE, 'examples')).find(d=>fs.existsSync(path.join(SITE, 'examples', d, 'index.html')));
  const pages = ['', 'plew-map/', 'examples/', 'user-guide/', 'how-it-works/', 'code-map/', `examples/${firstExample}/`];
  const browser = await playwright.chromium.launch();
  let fails = 0, checked = 0; const outside = new Set(), idCache = {};
  const fail = (page, text, href, why)=>{ fails++; console.log(`FAIL ${page || '/'} | "${text}" → ${href} | ${why}`); };
  async function idsOf(url){
    if (idCache[url]) return idCache[url];
    const p = await browser.newPage(); await p.route('**/cdnjs.cloudflare.com/**', r=>r.abort());
    const resp = await p.goto(url).catch(()=>null);
    const out = { status: resp ? resp.status() : 0, ids: resp && resp.ok() ? await p.evaluate(()=>[...document.querySelectorAll('[id]')].map(e=>e.id)) : [] };
    await p.close(); return (idCache[url] = out);
  }
  for (const pg of pages){
    const p = await browser.newPage(); await p.route('**/cdnjs.cloudflare.com/**', r=>r.abort());
    const errs = []; p.on('pageerror', e=>errs.push(e.message));
    const resp = await p.goto(base + pg);
    if (!resp || !resp.ok()){ fail(pg, '(page)', base + pg, 'page did not load'); await p.close(); continue; }
    await p.waitForTimeout(300);
    if (pg === '' || pg === 'plew-map/' || pg.startsWith('examples/') && pg !== 'examples/'){
      const nav = await p.evaluate(()=>['examplesNav', 'guideNav', 'howNav', 'codeMapNav'].filter(id=>{ const e = document.getElementById(id); return !e || getComputedStyle(e).display === 'none'; }));
      if (nav.length) fail(pg, '(sidebar)', nav.join(', '), 'sidebar link missing or hidden');
    }
    const links = await p.evaluate(()=>[...document.querySelectorAll('a[href]')].map(a=>({ text:a.textContent.trim().slice(0, 40), href:a.href, raw:a.getAttribute('href') })));
    for (const l of links){
      checked++;
      if (l.href.startsWith(`http://127.0.0.1:${PORT}`)){
        const u = new URL(l.href);
        if (!u.pathname.startsWith(SUB)){ fail(pg, l.text, l.raw, 'leaves the site sub-folder'); continue; }
        const target = await idsOf(u.origin + u.pathname);
        if (target.status !== 200){ fail(pg, l.text, l.raw, 'status ' + target.status); continue; }
        if (u.hash && u.hash.length > 1 && !target.ids.includes(decodeURIComponent(u.hash.slice(1)))) fail(pg, l.text, l.raw, 'no element with that id on the target page');
      } else {
        const m = l.href.match(/^https:\/\/github\.com\/len-sprague\/maplew\/blob\/main\/([^#?]+)/);
        if (m){ if (!fs.existsSync(path.join(ROOT, decodeURIComponent(m[1])))) fail(pg, l.text, l.href, 'file is not in the working tree'); }
        else if (/^https?:/.test(l.href)) outside.add(l.href);
      }
    }
    if (errs.length) fail(pg, '(page error)', errs.join('; '), 'uncaught error');
    await p.close();
  }
  await browser.close(); server.close();
  console.log(`${checked} links checked on ${pages.length} pages, ${fails} failed`);
  if (outside.size) console.log('outside links (not fetched):\n  ' + [...outside].sort().join('\n  '));
  process.exit(fails ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(2); });
