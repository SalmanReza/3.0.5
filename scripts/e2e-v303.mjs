// v3.0.5 update: only the corner label (line 8) changes, to v3.0.5 (marked "[v3.0.5]").
// v3.0.4 update: lines 1–3 and 8 of v3.0.3 are changed by v3.0.4 (C ticks select, D one Undo per prayer,
// E "Revise previous prayer" only after Undo, F no automatic late cards, H version). Their expectations are
// updated only where marked "[v3.0.4]"; every other check is unchanged.
// v3.0.3 browser checks: at least one per line (1–8) of the approved command, in EN and BN, plus month coverage,
// layout (1280x720 and 420x700, EN/BN, light/dark) and light screenshots.
// Run it against the build of the UNZIPPED release folder:
//   unzip Prayer-Times-v3.0.3.zip && cd Prayer-Times-v3.0.3 && npm ci && npx vite --port 1424 &
//   PRAYER_E2E_URL=http://127.0.0.1:1424/ node scripts/e2e-v303.mjs
import { launch, open as openRaw, sleep } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// light theme (Pearl Mint) unless a check sets its own
const open = (b, o = {}) => openRaw(b, { ...o, data: { theme: 'Pearl Mint', ...(o.data || {}) } });
const SHOTS = process.env.SHOTS_DIR || '/workspace/prayer/shots304/v303-e2e/';
fs.mkdirSync(SHOTS, { recursive: true });
const b = await launch();
let pass = 0, fail = 0;
const out = [];
const ok = (id, name, cond, info = '') => {
  (cond ? pass++ : fail++);
  const line = `${cond ? 'PASS' : 'FAIL'} [${id}] ${name}${info ? '  — ' + String(info).slice(0, 500) : ''}`;
  out.push(line);
  console.log(line);
};
const shot = async (p, sel, name) => {
  const el = sel ? await p.$(sel) : null;
  if (el) await el.screenshot({ path: path.join(SHOTS, name) });
  else await p.screenshot({ path: path.join(SHOTS, name) });
};
const LANGS = ['en', 'bn'];
const MID = '2026-11-23T14:00:00+06:00';        // Monday: Dhuhr open; Fajr and Duha ended
const AFTER_LOCK = '2026-11-23T16:10:00+06:00'; // after Asr began: Fajr/Duha record window locked
const FRI_LATE = '2026-11-20T16:10:00+06:00';   // Friday after Asr began: midday prayer ended, not locked
const DAY = '2026-11-23';
const rec = p => p.evaluate(() => JSON.parse(localStorage.getItem('prayer-times-data') || '{}'));
// [v3.0.4] late cards are the Revise previous prayer cards inside #liveEvents
const lateNames = p => p.evaluate(() => [...document.querySelectorAll('#liveEvents .late-event .live-name')].map(e => e.textContent.trim()));
// [v3.0.4] a prayer comes back late only after Undo: seed that Undo (pendingStore.reopened)
const REOPEN = { days: {}, other: {}, reopened: { '2026-11-23|fard|fajr': true, '2026-11-23|voluntary|duha': true } };
const soundCounter = p => p.evaluate(() => {
  window.__osc = 0; const O = window.AudioContext;
  if (O && !window.__patched) { window.__patched = true; window.AudioContext = class extends O { constructor(...a) { super(...a); const c = this.createOscillator; this.createOscillator = function (...x) { const o = c.apply(this, x); const s = o.start.bind(o); o.start = (...y) => { window.__osc++; return s(...y); }; return o; }; } }; }
});
const openDailyRecord = async (p, day) => { await p.evaluate(d => document.querySelector(`[data-week-date="${d}"]`)?.click(), day); await sleep(600); };
const backHome = async p => { await p.keyboard.press('Escape'); await sleep(500); await p.evaluate(() => { if (document.getElementById('homeView')?.hidden) document.querySelector('#weeklyDayBack, [data-back], .back-button')?.click(); }); await sleep(500); };

/* ---------- Line 1: Mark Complete on Record previous prayer cards ---------- */
for (const lang of LANGS) {
  const fajr = lang === 'bn' ? 'ফজর' : 'Fajr';
  const p = await open(b, { lang, w: 1280, h: 720, at: MID, data: { sound: true, tickSound: true }, pending: REOPEN }); // [v3.0.4]
  await soundCounter(p); // before the first sound, so the app's audio context is the counted one
  const cards = await p.evaluate(() => ({
    n: document.querySelectorAll('#liveEvents .live-event.late-event').length,
    mc: [...document.querySelectorAll('#liveEvents .live-event.late-event')].filter(c => c.querySelector('.mark-event-complete[data-mark-late="1"]')).length,
    label: document.querySelector('#liveEvents .late-event .mark-event-complete')?.textContent.trim()
  }));
  ok('1', `${lang}: every Revise previous prayer card (Fard and voluntary) has Mark Complete`, cards.n >= 2 && cards.mc === cards.n, JSON.stringify(cards));
  if (lang === 'en') await shot(p, '#liveEvents', 'L1-record-previous-mark-complete-en.png');
  if (lang === 'bn') await shot(p, '#liveEvents', 'L1-record-previous-mark-complete-bn.png');
  // voluntary: choose rak'ahs on the card's own circles, then Mark Complete
  await p.evaluate(() => document.querySelector('#liveEvents .late-event [data-vol-tick="duha"][data-vol-index="0"]')?.click());
  await sleep(300);
  await p.evaluate(() => document.querySelector('#liveEvents .late-event [data-vol-tick="duha"][data-vol-index="1"]')?.click());
  await sleep(300);
  await p.evaluate(() => { window.__osc = 0; });
  await p.evaluate(() => document.querySelector('#liveEvents .late-event [data-mark-complete="voluntary"][data-mark-key="duha"]')?.click());
  await sleep(600);
  let r = await rec(p);
  let d = r.history?.[DAY] || {};
  const volGone = !(await lateNames(p)).some(n => /Duha|দুহা/.test(n));
  const volFx = await p.evaluate(() => ({ osc: window.__osc, reward: !document.getElementById('voluntaryReward')?.hidden }));
  ok('1', `${lang}: late voluntary Mark Complete records the chosen rak'ahs (4), marks it late, closes the card, sound and reward`, d.voluntary?.duha === true && d.rakahs?.duha === 4 && d.late?.['voluntary:duha'] === true && d.closed?.['voluntary:duha'] === true && volGone && volFx.osc > 0 && volFx.reward, JSON.stringify({ d, volFx }));
  if (lang === 'en') await shot(p, null, 'L1-voluntary-mark-complete-reward-en.png');
  // Fard: Mark Complete with nothing ticked records the Fard, late mark, sound, toast (reward flow)
  await p.evaluate(() => { window.__osc = 0; });
  await p.evaluate(() => document.querySelector('#liveEvents .late-event [data-mark-complete="fard"][data-mark-key="fajr"]')?.click());
  await sleep(700);
  r = await rec(p);
  d = r.history?.[DAY] || {};
  const after = await p.evaluate(() => ({ osc: window.__osc, toast: document.getElementById('toast')?.textContent || '', names: [...document.querySelectorAll('#liveEvents .live-event.late-event .live-name')].map(e => e.textContent.trim()) }));
  ok('1', `${lang}: late Fard Mark Complete records Fajr "recorded after its time", plays the sound, shows the toast, closes the card`, d.fard?.fajr === true && d.late?.['fard:fajr'] === true && d.closed?.['fard:fajr'] === true && after.osc > 0 && after.toast.length > 0 && !after.names.includes(fajr), JSON.stringify({ d, after }));
  await openDailyRecord(p, DAY);
  const txt = await p.evaluate(() => document.getElementById('weeklyDayCards')?.innerText || '');
  const lateText = lang === 'bn' ? 'সময়ের পরে রেকর্ড' : 'recorded after its time';
  ok('1', `${lang}: the daily record says "${lateText}" for both`, (txt.match(new RegExp(lateText, 'g')) || []).length >= 2, txt.slice(0, 300));
  if (lang === 'en') await shot(p, '#weeklyDayCards', 'L1-daily-record-late-en.png');
  await p.close();
  // Friday rule: Mark Complete on the ended midday card records Jumu'ah (not Dhuhr), late
  const f = await open(b, { lang, w: 1280, h: 720, at: FRI_LATE, pending: { days: {}, other: {}, reopened: { '2026-11-20|fard|dhuhr': true } } }); // [v3.0.4]
  await f.evaluate(() => document.querySelector('#liveEvents .late-event [data-mark-complete="fard"][data-mark-key="dhuhr"]')?.click());
  await sleep(600);
  const fr = (await rec(f)).history?.['2026-11-20'] || {};
  ok('1', `${lang}: Friday late Mark Complete follows the Friday rule (Jumu'ah, Dhuhr stays clear) and marks late`, fr.fridayFard === 'jumuah' && !fr.fard?.dhuhr && fr.late?.['fard:dhuhr'] === true && fr.closed?.['fard:dhuhr'] === true, JSON.stringify(fr));
  await f.close();
  // ordered ticks still apply on a late voluntary card before Mark Complete
  const o = await open(b, { lang, w: 1280, h: 720, at: MID, pending: REOPEN }); // [v3.0.4]
  await o.evaluate(() => document.querySelector('#liveEvents .late-event [data-vol-tick="duha"][data-vol-index="2"]')?.click());
  await sleep(300);
  const skipped = !(await rec(o)).history?.[DAY]?.rakahs?.duha;
  ok('1', `${lang}: late circles still tick in order (a skipped circle is refused)`, skipped);
  // after the record-window lock Mark Complete cannot record (cards are gone)
  await o.close();
  const l = await open(b, { lang, w: 1280, h: 720, at: AFTER_LOCK, pending: REOPEN }); // [v3.0.4] even a seeded Undo is gone at the lock
  const lockedNames = await lateNames(l);
  ok('1', `${lang}: after the record-window lock there is no Fajr/Duha card to complete`, !lockedNames.some(n => /Fajr|ফজর|Duha|দুহা/.test(n)), JSON.stringify(lockedNames));
  await l.close();
}

/* ---------- Line 2: undo shows only that prayer ---------- */
for (const lang of LANGS) {
  const p = await open(b, { lang, w: 1280, h: 720, at: MID, pending: REOPEN }); // [v3.0.4]
  await p.evaluate(() => document.querySelector('#liveEvents .late-event [data-mark-complete="voluntary"][data-mark-key="duha"]')?.click());
  await sleep(500);
  await p.evaluate(() => document.querySelector('#liveEvents .late-event [data-mark-complete="fard"][data-mark-key="fajr"]')?.click());
  await sleep(500);
  const before = await lateNames(p);
  await openDailyRecord(p, DAY);
  const u = await p.$('[data-week-undo="prayer"][data-week-key="fajr"]'); // [v3.0.4] D1 one Undo per prayer
  if (u) await u.click();
  await sleep(500);
  await backHome(p);
  const names = await lateNames(p);
  const live = await p.evaluate(() => [...document.querySelectorAll('#liveEvents .live-event .live-name')].map(e => e.textContent.trim()));
  const fajr = lang === 'bn' ? 'ফজর' : 'Fajr';
  ok('2', `${lang}: undoing Fajr brings back the Fajr card only (Duha stays closed, nothing else surfaces)`, before.length === 0 && !!u && names.length === 1 && names[0] === fajr, JSON.stringify({ before, names, live }));
  if (lang === 'en') await shot(p, '#liveEvents', 'L2-undo-only-that-prayer-en.png');
  if (lang === 'bn') await shot(p, '#liveEvents', 'L2-undo-only-that-prayer-bn.png');
  await p.close();
  // open time: the card comes back under the normal heading, not under Record previous prayer
  const w = await open(b, { lang, w: 1280, h: 720, at: MID, data: { history: { [DAY]: { fard: { fajr: true, dhuhr: true }, voluntary: { duha: true }, rakahs: { duha: 2 }, rakahSets: { duha: [true] }, closed: { 'fard:fajr': true, 'fard:dhuhr': true, 'voluntary:duha': true } } } } });
  const liveBefore = await w.evaluate(() => document.querySelectorAll('#liveEvents .live-event').length);
  await openDailyRecord(w, DAY);
  const u2 = await w.$('[data-week-undo="prayer"][data-week-key="dhuhr"]'); // [v3.0.4] D1
  if (u2) await u2.click();
  await sleep(400);
  await backHome(w);
  const res = await w.evaluate(() => ({
    live: [...document.querySelectorAll('#liveEvents .live-event .live-name')].map(e => e.textContent.trim()),
    late: [...document.querySelectorAll('#liveEvents .late-event .live-name')].map(e => e.textContent.trim())
  }));
  ok('2', `${lang}: undoing the open Dhuhr re-opens Dhuhr under the normal heading only`, !!u2 && res.live.length === liveBefore + 1 && res.live.some(n => /Dhuhr|যোহর/.test(n)) && res.late.length === 0, JSON.stringify({ liveBefore, ...res }));
  await w.close();
}

/* ---------- Line 3: late voluntary cards stay while partly ticked / unticked, until the window closes ---------- */
for (const lang of LANGS) {
  const p = await open(b, { lang, w: 1280, h: 720, at: MID, pending: REOPEN }); // [v3.0.4]
  await p.evaluate(() => document.querySelector('#liveEvents .late-event [data-vol-tick="duha"][data-vol-index="0"]')?.click());
  await sleep(500);
  const stays = (await lateNames(p)).some(n => /Duha|দুহা/.test(n));
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(900);
  const r = (await rec(p)).history?.[DAY] || {};
  const staysAfterReload = (await lateNames(p)).some(n => /Duha|দুহা/.test(n));
  // [v3.0.4] C: the tick is a selection (kept in 'prayer-times-pending'), not a record
  const pend = await p.evaluate(() => JSON.parse(localStorage.getItem('prayer-times-pending') || '{}'));
  ok('3', `${lang}: a partly ticked revise Duha (2 of up to 8) stays under Revise previous prayer, also after a reload (selected, not recorded)`, stays && staysAfterReload && !r.rakahs?.duha && pend.days?.[DAY]?.rakahs?.duha === 2, JSON.stringify({ stays, staysAfterReload, rakahs: r.rakahs, pend: pend.days?.[DAY] }));
  await shot(p, '#liveEvents', `L3-partly-ticked-voluntary-stays-${lang}.png`);
  // untick the voluntary in the daily record: it returns
  await p.evaluate(() => document.querySelector('#liveEvents .late-event [data-mark-complete="voluntary"][data-mark-key="duha"]')?.click());
  await sleep(500);
  const gone = !(await lateNames(p)).some(n => /Duha|দুহা/.test(n));
  await openDailyRecord(p, DAY);
  const u = await p.$('[data-week-undo="voluntary"][data-week-key="duha"]');
  if (u) await u.click();
  await sleep(400);
  await backHome(p);
  const back = await lateNames(p);
  ok('3', `${lang}: an undone late voluntary returns under Revise previous prayer (only that one)`, gone && !!u && back.filter(n => /Duha|দুহা/.test(n)).length === 1, JSON.stringify({ gone, undo: !!u, back }));
  await p.close();
  // once the existing window closes, it goes
  const partial = { history: { [DAY]: { fard: { fajr: true }, voluntary: { duha: true }, rakahs: { duha: 2 }, rakahSets: { duha: [true] } } } };
  const l = await open(b, { lang, w: 1280, h: 720, at: AFTER_LOCK, data: partial, pending: REOPEN }); // [v3.0.4]
  const names = await lateNames(l);
  ok('3', `${lang}: after the record window closes the partly ticked Duha is gone`, !names.some(n => /Duha|দুহা/.test(n)), JSON.stringify(names));
  await l.close();
}

/* ---------- Line 4: passages ---------- */
{
  const p = await open(b, { lang: 'en', w: 1280, h: 720, at: MID });
  const d = await p.evaluate(async () => {
    const m = await import('/src/blessed-reminder.js');
    const R = await m.loadReading();
    const P = R.passages;
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, '5-10': 0, over10: 0 };
    let total = 0, crossJuz = 0, max = 0;
    const juzStarts = new Set(P.juz);
    for (let i = 0; i < P.starts.length; i++) {
      const v = m.passageVerses(P, i);
      const n = v.to - v.from; total += n; max = Math.max(max, n);
      dist[n > 10 ? 'over10' : n >= 5 ? '5-10' : n]++;
      for (let x = v.from + 1; x < v.to; x++) if (juzStarts.has(x)) crossJuz++;
    }
    const perJuz = [];
    for (let j = 1; j <= 30; j++) { const r = m.dayRange(P, [j]); perJuz.push(r.to - r.from); }
    const d29 = m.dayRange(P, [29, 30]);
    return { count: P.starts.length, total, dist, max, crossJuz, perJuz, day29of29: d29.to - d29.from };
  });
  ok('4', `passages: ${d.count} covering ${d.total} verses, none over 10 (max ${d.max}), juz' never crossed`, d.count === 2739 && d.total === 6236 && d.dist.over10 === 0 && d.max <= 10 && d.crossJuz === 0, JSON.stringify(d));
  ok('4', 'distribution 1/2/3/4/5–10 = 679/1176/538/259/87', JSON.stringify(d.dist) === JSON.stringify({ 1: 679, 2: 1176, 3: 538, 4: 259, '5-10': 87, over10: 0 }), JSON.stringify(d.dist));
  fs.writeFileSync(path.join(SHOTS, 'passages-per-day.json'), JSON.stringify(d, null, 1));
  await p.close();
}
async function monthCoverage(startCivil, days, adj) {
  const seen = new Map();
  const perDay = [];
  for (let k = 1; k <= days; k++) {
    const at = new Date(new Date(`${startCivil}T10:00:00+06:00`).getTime() + (k - 1) * 864e5).toISOString();
    const p = await open(b, { lang: 'en', w: 1280, h: 720, at, data: { hijriAdjust: adj } });
    await sleep(500);
    await p.evaluate(() => document.querySelector('#dailyNote [data-blessed-portion]')?.click());
    await sleep(250);
    const refs = await p.evaluate(async () => {
      const m = await import('/src/blessed-reminder.js');
      const R = await m.loadReading();
      const ids = [...document.querySelectorAll('#portionList .portion-item')].map(e => Number(e.dataset.portion));
      const verses = [];
      for (const i of ids) { const v = m.passageVerses(R.passages, i); for (let x = v.from; x < v.to; x++) verses.push(x); }
      return { verses, summary: document.getElementById('portionSummary').textContent, n: ids.length, hijri: document.getElementById('hijriDateLabel')?.textContent || '' };
    });
    perDay.push({ k, at: at.slice(0, 10), n: refs.n, summary: refs.summary, hijri: refs.hijri });
    for (const v of refs.verses) seen.set(v, (seen.get(v) || 0) + 1);
    await p.close();
  }
  return { seen, perDay, once: seen.size === 6236 && [...seen.values()].every(c => c === 1) };
}
if (!process.env.SKIP_MONTHS) {
  const months = {};
  // civil start of Jumada II (29 days) and Rajab (30 days) 1448 for each adjustment (Intl umalqura, before Maghrib)
  const starts = { 0: ['2026-11-11', '2026-12-10'], 1: ['2026-11-10', '2026-12-09'], '-1': ['2026-11-12', '2026-12-11'] };
  for (const adj of [0, 1, -1]) {
    const m29 = await monthCoverage(starts[adj][0], 29, adj);
    const m30 = await monthCoverage(starts[adj][1], 30, adj);
    months[adj] = { m29: m29.perDay, m30: m30.perDay };
    const tag = adj > 0 ? `+${adj}` : String(adj);
    ok('4/9', `adjust ${tag}: 29-day month (Jumada II 1448) shows all 6,236 verses exactly once; day 1 juz' 1, day 29 juz' 29–30`, m29.once && /^Juz' 1 · /.test(m29.perDay[0].summary) && /^Juz' 29–30 · \d+ of 366/.test(m29.perDay[28].summary), JSON.stringify({ size: m29.seen.size, d1: m29.perDay[0], d29: m29.perDay[28] }));
    ok('4/9', `adjust ${tag}: 30-day month (Rajab 1448) shows all 6,236 verses exactly once; day 30 juz' 30`, m30.once && /^Juz' 1 · /.test(m30.perDay[0].summary) && /^Juz' 30 · \d+ of 190/.test(m30.perDay[29].summary), JSON.stringify({ size: m30.seen.size, d1: m30.perDay[0], d30: m30.perDay[29] }));
  }
  fs.writeFileSync(path.join(SHOTS, 'month-coverage-adjust.json'), JSON.stringify(months, null, 1));
}

/* ---------- Line 5: Read more on long verses (reminder and Today's portion, EN/BN) ---------- */
for (const lang of LANGS) {
  const at = '2026-11-13T10:00:00+06:00'; // Hijri 1448-06-03: juz' 3 contains 2:282
  const p = await open(b, { lang, w: 1280, h: 720, at });
  await sleep(600);
  const idx = await p.evaluate(async () => {
    const m = await import('/src/blessed-reminder.js');
    const R = await m.loadReading();
    for (let i = 0; i < R.passages.starts.length; i++) { const v = m.passageVerses(R.passages, i); if (v.from <= 288 && 288 < v.to) return i; }
    return -1;
  });
  // the reminder: show the passage with 2:282
  await p.evaluate(async i => {
    const m = await import('/src/blessed-reminder.js');
    const mem = JSON.parse(localStorage.getItem(m.READING_KEY));
    mem.current = i; mem.shownAt = Date.now();
    localStorage.setItem(m.READING_KEY, JSON.stringify(mem));
  }, idx);
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);
  const pre = await p.evaluate(() => {
    const vs = [...document.querySelectorAll('#dailyNote .blessed-verse')].map(e => e.textContent);
    const more = document.querySelector('#dailyNote [data-blessed-toggle]');
    return { vs, longest: Math.max(...vs.map(v => v.length)), more: more?.textContent.trim(), ref: document.querySelector('#dailyNote .blessed-ref')?.textContent };
  });
  const moreText = lang === 'bn' ? /আরও|আরো/ : /Read more/;
  ok('5', `${lang}: reminder shows 2:282 as a short preview ending in "…" with Read more`, pre.vs.some(v => v.trim().endsWith('…') && v.length < 260) && moreText.test(pre.more || ''), JSON.stringify({ ref: pre.ref, longest: pre.longest, more: pre.more }));
  if (lang === 'en') await shot(p, '#dailyNote', 'L5-long-verse-preview-en.png');
  if (lang === 'bn') await shot(p, '#dailyNote', 'L5-long-verse-preview-bn.png');
  await p.evaluate(() => document.querySelector('#dailyNote [data-blessed-toggle]')?.click());
  await sleep(500);
  const full = await p.evaluate(async i => {
    const vs = [...document.querySelectorAll('#dailyNote .blessed-verse')].map(e => e.textContent);
    return { longest: Math.max(...vs.map(v => v.length)), ellipsis: vs.some(v => v.trim().endsWith('…')) };
  }, idx);
  ok('5', `${lang}: Read more expands the whole verse (over 1,000 characters, no ellipsis)`, full.longest > 1000 && !full.ellipsis, JSON.stringify(full));
  await shot(p, '#dailyNote', `L5-long-verse-expanded-${lang}.png`);
  // Today's portion (fresh page state, so the reminder's Read more does not carry over)
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(900);
  await p.evaluate(() => document.querySelector('#dailyNote [data-blessed-portion]')?.click());
  await sleep(400);
  await p.evaluate(i => document.querySelector(`#portionList [data-portion-open="${i}"]`)?.click(), idx);
  await sleep(400);
  const port = await p.evaluate(() => {
    const vs = [...document.querySelectorAll('#portionList .portion-item.is-open .blessed-verse')].map(e => e.textContent);
    return { prev: vs.some(v => v.trim().endsWith('…')), more: !!document.querySelector('#portionList .portion-item.is-open [data-blessed-toggle]') };
  });
  await p.evaluate(() => document.querySelector('#portionList .portion-item.is-open [data-blessed-toggle]')?.click());
  await sleep(400);
  const port2 = await p.evaluate(() => Math.max(...[...document.querySelectorAll('#portionList .portion-item.is-open .blessed-verse')].map(e => e.textContent.length)));
  ok('5', `${lang}: Today's portion shows the same preview and Read more expands it`, port.prev && port.more && port2 > 1000, JSON.stringify({ ...port, expanded: port2 }));
  if (lang === 'en') await shot(p, '#portionDialog', 'L5-portion-preview-en.png');
  await p.close();
}

/* ---------- Line 6: Hijri date adjustment ---------- */
for (const lang of LANGS) {
  const p = await open(b, { lang, w: 1280, h: 720, at: MID });
  const read = () => p.evaluate(() => ({
    hijri: document.getElementById('hijriDateLabel')?.textContent.trim(),
    juz: document.querySelector('#dailyNote .blessed-progress')?.textContent.trim(),
    times: [...document.querySelectorAll('#prayerGrid .prayer-card time, #prayerGrid .prayer-time, #prayerGrid [data-time]')].map(e => e.textContent.trim()).join('|') || document.getElementById('prayerGrid')?.innerText.replace(/\s+/g, ' ').match(/\d{1,2}[:.]\d{2}|[০-৯]{1,2}:[০-৯]{2}/g)?.join('|')
  }));
  const base = await read();
  await p.evaluate(() => document.getElementById('settingsToggle')?.click());
  await sleep(700);
  const ctl = await p.evaluate(() => {
    const s = document.getElementById('hijriAdjustSelect');
    const card = s?.closest('section');
    return { exists: !!s, value: s?.value, options: s ? [...s.options].map(o => o.value + '=' + o.textContent) : [], label: document.getElementById('hijriAdjustLabel')?.textContent, card: card?.querySelector('.eyebrow')?.textContent, note: document.getElementById('hijriAdjustNote')?.textContent };
  });
  const wantLabel = lang === 'bn' ? 'হিজরি তারিখ সমন্বয়' : 'Hijri date adjustment';
  ok('6', `${lang}: Settings › Time adjustments has "${wantLabel}" with −2, −1, 0, +1, +2 days, default 0`, ctl.exists && ctl.value === '0' && ctl.label === wantLabel && ctl.options.length === 5 && ctl.options.map(o => o.split('=')[0]).join(',') === '-2,-1,0,1,2', JSON.stringify(ctl));
  await p.evaluate(() => document.getElementById('hijriAdjustSelect')?.scrollIntoView({ block: 'center' }));
  await sleep(200);
  if (lang === 'en') await shot(p, '#hijriAdjustRow', 'L6-hijri-adjust-control-en.png');
  if (lang === 'bn') await shot(p, '#hijriAdjustRow', 'L6-hijri-adjust-control-bn.png');
  if (lang === 'en') { const card = await p.evaluateHandle(() => document.getElementById('hijriAdjustSelect').closest('section')); await card.asElement().screenshot({ path: path.join(SHOTS, 'L6-time-adjustments-card-en.png') }); }
  await p.select('#hijriAdjustSelect', '1');
  await sleep(500);
  await backHome(p);
  await p.evaluate(() => document.querySelector('#backHome, [data-go-home], #settingsBack')?.click());
  await sleep(500);
  const plus = await read();
  const saved = (await rec(p)).hijriAdjust;
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(900);
  const reloaded = await read();
  ok('6', `${lang}: +1 moves the Hijri date by one day and the day's juz' 13 → 14; saved and kept after a reload`, saved === 1 && plus.hijri !== base.hijri && /(14|১৪)/.test(plus.juz || '') && /(13|১৩)/.test(base.juz || '') && reloaded.hijri === plus.hijri, JSON.stringify({ base, plus, saved, reloaded: reloaded.hijri }));
  ok('6', `${lang}: prayer times are unchanged by the adjustment`, !!base.times && base.times === plus.times, JSON.stringify({ a: base.times, b: plus.times }));
  await p.close();
  const m = await open(b, { lang, w: 1280, h: 720, at: MID, data: { hijriAdjust: -1 } });
  const minus = await m.evaluate(() => ({ hijri: document.getElementById('hijriDateLabel')?.textContent.trim(), juz: document.querySelector('#dailyNote .blessed-progress')?.textContent.trim() }));
  ok('6', `${lang}: −1 shows the previous Hijri day and juz' 12`, /(12|১২)/.test(minus.juz || '') && minus.hijri !== base.hijri, JSON.stringify({ base: base.hijri, minus }));
  await m.close();
}
// the Hijri date shown matches the umalqura date shifted by the adjustment (EN)
{
  const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: 'Asia/Dhaka', day: 'numeric' });
  const res = [];
  for (const adj of [-2, -1, 0, 1, 2]) {
    const p = await open(b, { lang: 'en', w: 1280, h: 720, at: MID, data: { hijriAdjust: adj } });
    const h = await p.evaluate(() => document.getElementById('hijriDateLabel')?.textContent.trim());
    const want = fmt.format(new Date(Date.parse(MID) + adj * 864e5));
    res.push({ adj, h, want, ok: new RegExp(`\\b${want}\\b`).test(h || '') });
    await p.close();
  }
  ok('6', 'every adjustment −2..+2 shows the umalqura date shifted by that many days', res.every(x => x.ok), JSON.stringify(res));
}

/* ---------- Line 7: backup ---------- */
for (const lang of LANGS) {
  const p = await open(b, { lang, w: 1280, h: 720, at: MID, data: { blessedProgress: false, hijriAdjust: 2 } });
  const exported = await p.evaluate(async () => {
    let captured = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = blob => { captured = blob; return orig.call(URL, blob); };
    HTMLAnchorElement.prototype.click = function () {};
    document.getElementById('exportData').click();
    await new Promise(r => setTimeout(r, 200));
    return captured ? JSON.parse(await captured.text()).data : null;
  });
  ok('7', `${lang}: export includes the progress-line switch and the Hijri adjustment`, exported && exported.blessedProgress === false && exported.hijriAdjust === 2, JSON.stringify({ blessedProgress: exported?.blessedProgress, hijriAdjust: exported?.hijriAdjust }));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk303-'));
  const newer = path.join(tmp, 'new.json');
  fs.writeFileSync(newer, JSON.stringify({ version: 1, appVersion: '3.0.3', data: { ...exported, blessedProgress: true, hijriAdjust: -1 } }));
  const older = path.join(tmp, 'old.json');
  const oldData = { ...exported }; delete oldData.blessedProgress; delete oldData.hijriAdjust;
  fs.writeFileSync(older, JSON.stringify({ version: 1, appVersion: '3.0.2', data: oldData }));
  await p.evaluate(() => document.getElementById('settingsToggle')?.click());
  await sleep(600);
  const input = await p.$('#importFile');
  await input.uploadFile(newer);
  await sleep(500);
  await p.evaluate(() => document.getElementById('replaceBackup').click());
  await sleep(700);
  let s = await rec(p);
  const st1 = await p.evaluate(() => document.getElementById('backupStatus')?.textContent);
  ok('7', `${lang}: importing a v3.0.3 backup (Replace) restores both settings (neither reported as unavailable)`, s.blessedProgress === true && s.hijriAdjust === -1 && /^Replaced/.test(st1 || '') && !/blessedProgress|hijriAdjust/.test(st1 || ''), JSON.stringify({ blessedProgress: s.blessedProgress, hijriAdjust: s.hijriAdjust, st1 }));
  // set non-defaults, then import an older backup without them
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('prayer-times-data')); d.blessedProgress = false; d.hijriAdjust = 2; localStorage.setItem('prayer-times-data', JSON.stringify(d)); });
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(800);
  await p.evaluate(() => document.getElementById('settingsToggle')?.click());
  await sleep(600);
  const input2 = await p.$('#importFile');
  await input2.uploadFile(older);
  await sleep(500);
  await p.evaluate(() => document.getElementById('replaceBackup').click());
  await sleep(700);
  s = await rec(p);
  const st2 = await p.evaluate(() => document.getElementById('backupStatus')?.textContent);
  ok('7', `${lang}: an older backup without them still imports, with the defaults (switch on, adjustment 0)`, s.blessedProgress === true && s.hijriAdjust === 0 && /Replaced/.test(st2 || ''), JSON.stringify({ blessedProgress: s.blessedProgress, hijriAdjust: s.hijriAdjust, st2, errs: p.errs }));
  await p.close();
}

/* ---------- Line 8: version label ---------- */
for (const lang of LANGS) {
  const p = await open(b, { lang, w: 1280, h: 720, at: MID });
  const v = await p.evaluate(() => document.getElementById('appVersionLabel').textContent.trim());
  ok('8', `${lang}: corner label reads ${lang === 'bn' ? 'v৩.০.৫' : 'v3.0.5'}`, v === (lang === 'bn' ? 'v৩.০.৫' : 'v3.0.5'), v); // [v3.0.4] H [v3.0.5] 4
  await p.screenshot({ path: path.join(SHOTS, `L8-version-label-${lang}.png`), clip: { x: 1160, y: 690, width: 120, height: 30 } });
  // the reminder with its progress line ("Juz' 13 · n of 69 passages read today"), switch on by default
  const prog = await p.evaluate(() => document.querySelector('#dailyNote .blessed-progress')?.textContent.trim() || '');
  ok('8', `${lang}: the reminder's progress line is shown`, lang === 'bn' ? /পারা/.test(prog) : /^Juz' 13 · \d+ of \d+ passages read today/.test(prog), prog);
  await shot(p, '#dailyNote', `progress-line-${lang}.png`);
  await p.close();
}

/* ---------- Layout: 1280x720 and 420x700, EN/BN, light and dark ---------- */
const layoutCheck = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth;
  const sels = ['#dailyNote', '#liveEvents', '#liveEvents', '.live-event', '.live-event-footer', '.mark-event-complete', '.vol-count', '.blessed-progress', '.blessed-actions', '.blessed-verse', '#prayerGrid', '#voluntaryList', '#hijriAdjustRow', '#hijriAdjustSelect', '#adjustmentGrid'];
  const bad = [];
  for (const s of sels) for (const e of document.querySelectorAll(s)) { if (!e.offsetParent) continue; const r = e.getBoundingClientRect(); if (r.right > W + 1 || r.left < -1 || e.scrollWidth > e.clientWidth + 2) bad.push({ s, r: Math.round(r.right), sw: e.scrollWidth, cw: e.clientWidth }); }
  return { pageOverflow: document.documentElement.scrollWidth > W + 1, bad };
});
for (const lang of LANGS) {
  for (const [w, h] of [[1280, 720], [420, 700]]) {
    for (const theme of ['Pearl Mint', 'Obsidian']) {
      const tone = theme === 'Obsidian' ? 'dark' : 'light';
      const p = await open(b, { lang, w, h, at: MID, data: { theme }, pending: REOPEN }); // [v3.0.4]
      await sleep(600);
      const home = await layoutCheck(p);
      ok('Layout', `${lang} ${w}x${h} ${tone}: home (with Revise previous prayer cards and Mark Complete) does not overflow`, !home.pageOverflow && home.bad.length === 0 && !p.errs.length, JSON.stringify({ ...home, errs: p.errs }));
      if (tone === 'light' && w === 420) await p.screenshot({ path: path.join(SHOTS, `narrow-home-${lang}.png`), fullPage: true });
      if (tone === 'light' && w === 1280) await p.screenshot({ path: path.join(SHOTS, `wide-home-${lang}.png`) });
      await p.evaluate(() => document.getElementById('settingsToggle')?.click());
      await sleep(600);
      await p.evaluate(() => document.getElementById('hijriAdjustSelect')?.scrollIntoView({ block: 'center' }));
      await sleep(200);
      const set = await layoutCheck(p);
      ok('Layout', `${lang} ${w}x${h} ${tone}: Settings with the Hijri adjustment does not overflow`, !set.pageOverflow && set.bad.length === 0, JSON.stringify(set));
      if (tone === 'light' && w === 420) await shot(p, '#hijriAdjustRow', `narrow-hijri-adjust-${lang}.png`);
      await p.close();
    }
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
fs.writeFileSync(path.join(SHOTS, 'e2e-v303-results.txt'), `URL: ${process.env.PRAYER_E2E_URL || '(default)'}\n${out.join('\n')}\n\n${pass}/${pass + fail} passed\n`);
await b.close();
process.exit(fail ? 1 : 0);
