// Render every screen (light + dark) to PNG at 2x, plus the overview board,
// and run a WCAG contrast pass over all visible text.
// Usage: node render.cjs            (needs `playwright` or `playwright-core`)
//        PW=/path/to/playwright-core CHROME=/path/to/chrome node render.cjs
'use strict';
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require(process.env.PW || 'playwright'); } catch (e) { pw = require('playwright-core'); }
const { chromium } = pw;

const here = __dirname;
const out = path.join(here, 'renders');
fs.mkdirSync(out, { recursive: true });
const url = 'file://' + path.join(here, 'index.html') + '?static';

const contrastAudit = () => {
  const lum = (c) => {
    const m = c.match(/[\d.]+/g).map(Number);
    const [r, g, b] = m.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return { L: 0.2126 * r + 0.7152 * g + 0.0722 * b, a: m.length > 3 ? m[3] : 1, rgb: m.slice(0, 3) };
  };
  const blend = (fg, bg) => fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
  const toL = (rgb) => lum('rgb(' + rgb.join(',') + ')').L;
  const bgOf = (el) => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { stack.push(c); if (lum(c).a >= 1) break; }
    }
    let rgb = [255, 255, 255];
    for (let i = stack.length - 1; i >= 0; i--) rgb = blend(lum(stack[i]), rgb);
    return rgb;
  };
  const fails = [];
  const walker = document.createTreeWalker(document.querySelector('#rows'), NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const txt = node.textContent.trim();
    if (!txt) continue;
    const el = node.parentElement;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity;
    const bg = bgOf(el);
    const fgc = lum(cs.color); fgc.a *= op;
    const fg = blend(fgc, bg);
    const L1 = toL(fg), L2 = toL(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      const shot = el.closest('.shot'), row = el.closest('.row');
      fails.push(`${row.className.replace('row ', '')} ${shot ? shot.dataset.id : '-'} "${txt.slice(0, 40)}" ${ratio.toFixed(2)} < ${need}`);
    }
  }
  return fails;
};

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 4700, height: 2200 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.evaluate(() => document.fonts.ready);

  const fails = await page.evaluate(contrastAudit);
  console.log(fails.length ? 'CONTRAST FAILS:\n' + fails.join('\n') : 'contrast: all text passes WCAG AA');

  // per-screen PNGs with transparent corners
  await page.addStyleTag({ content: '.row,body{background:transparent!important}' });
  const shots = await page.$$eval('.row', (rs) => rs.map((r) => ({
    theme: r.classList.contains('t-dark') ? 'dark' : 'light',
    ids: [...r.querySelectorAll('.shot')].map((s) => s.dataset.id),
  })));
  const written = [];
  for (const { theme, ids } of shots) {
    for (const id of ids) {
      const el = await page.$(`.row.t-${theme} .shot[data-id="${id}"] .screen`);
      const f = path.join(out, `${id}-${theme}.png`);
      await el.screenshot({ path: f, omitBackground: true });
      written.push(f);
    }
  }

  // overview board at 1x
  const board = await browser.newPage({ viewport: { width: 4700, height: 1000 }, deviceScaleFactor: 1 });
  await board.goto(url);
  await board.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await board.evaluate(() => document.fonts.ready);
  const w = await board.evaluate(() => Math.ceil(document.querySelector('.screens').scrollWidth + 112));
  await board.setViewportSize({ width: w, height: 1000 });
  await board.screenshot({ path: path.join(out, 'board.png'), fullPage: true });
  written.push(path.join(out, 'board.png'));

  console.log(written.map((f) => path.relative(here, f)).join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
