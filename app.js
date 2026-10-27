// Lab Attendance front end. The API address comes from config.js
const VERCEL_API_URL = window.APP_CONFIG.API_URL;

const $ = id => document.getElementById(id);
const COLORS = ['#0f5c46','#b5762a','#2f6f9f','#9a4a6b','#5b4b9a','#5c7a2e'];
const sel = new Set();
let records = [], first = true, popId = null, pending = 0, view = 'cards', stat = '', shownNow = [];

function el(tag, cls, text){ const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const colorFor = s => { let h = 0; for (const c of s) h = (h*31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const dayKey = d => { const t = new Date(d); return isNaN(t) ? '' : t.toISOString().slice(0,10); };
const at = k => new Date(k + 'T00:00:00Z');
const fmt = (k, y) => at(k).toLocaleDateString('en-US',{month:'short',day:'numeric',year:y ? 'numeric' : undefined,timeZone:'UTC'});
const FIELD = { present:'attendance_dates', late:'late_dates', absent:'absent_dates', excused:'excused_dates' };
const LABEL = { present:'Present', late:'Late', absent:'Absent', excused:'Excused' };
const smapCache = new WeakMap();
const smap = r => { let m = smapCache.get(r); if (!m){ m = {}; for (const s in FIELD) (r[FIELD[s]] || []).forEach(d => { const k = dayKey(d); if (k) m[k] = s; }); smapCache.set(r, m); } return m; };
const statusOn = (r, k) => smap(r)[k] || '';
const rec = r => Object.keys(smap(r)).sort();
const keys = r => { const m = smap(r); return Object.keys(m).filter(k => m[k] === 'present' || m[k] === 'late').sort(); };
const same = (r, p) => r.student_name === p.student_name && r.subject_name === p.subject_name && r.section === p.section;
const payload = (r, date) => ({ student_name: r.student_name, subject_name: r.subject_name, section: r.section, date });
const shift = (k, n) => { const d = at(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); };
function todayKey(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function setStatus(ok){ $('status').className = 'pill ' + (ok ? 'ok' : 'bad'); $('statusText').textContent = ok ? 'Database connected' : 'Offline'; }
const store = { get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch(e){} } };
const THR = { pct: parseInt(store.get('tPct')) || 75, run: parseInt(store.get('tRun')) || 2 };
const startOf = r => r.start_date ? dayKey(r.start_date) : (rec(r)[0] || dayKey(r.createdAt));
let CLS = new Map(), DC = new Map();
const buildCls = () => { CLS = new Map(); DC = new Map(); records.forEach(r => { const k = r.section + '\u0001' + r.subject_name; if (!CLS.has(k)) CLS.set(k, new Set()); rec(r).forEach(d => CLS.get(k).add(d)); }); };
const daysOf = r => { let d = DC.get(r._id); if (!d){ const st = startOf(r); d = [...(CLS.get(r.section + '\u0001' + r.subject_name) || [])].filter(k => k >= st).sort(); DC.set(r._id, d); } return d; };
const absRun = (r, ds, day) => { const m = smap(r); let n = 0; for (let i = ds.length - 1; i >= 0; i--) { const x = m[ds[i]] || ''; if (x === 'absent' || (x === '' && ds[i] !== day)) n++; else break; } return n; };
function toast(m, undo){
  const t = $('toast'); t.replaceChildren(document.createTextNode(m));
  if (undo){ const b = el('button',null,'Undo'); b.type = 'button'; b.onclick = () => { t.classList.remove('show'); undo(); }; t.appendChild(b); }
  t.classList.add('show'); clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), undo ? 8000 : 2800);
}
function countUp(node, to, suf){
  const from = parseInt(node.textContent) || 0, t0 = performance.now();
  (function step(t){ const p = Math.min(1, (t - t0) / 700); node.textContent = Math.round(from + (to - from) * p) + (suf || ''); if (p < 1) requestAnimationFrame(step); })(t0);
}
function burst(node){
  const r = node.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.bottom - 30;
  for (let i = 0; i < 14; i++){
    const p = el('span','conf'); p.style.left = cx + 'px'; p.style.top = cy + 'px'; p.style.background = COLORS[i % COLORS.length]; document.body.appendChild(p);
    const a = Math.random() * 6.28, d = 40 + Math.random() * 60;
    p.animate([{transform:'translate(0,0)',opacity:1},{transform:'translate(' + Math.cos(a)*d + 'px,' + (Math.sin(a)*d + 30) + 'px) rotate(' + Math.random()*400 + 'deg)',opacity:0}],{duration:700 + Math.random()*300,easing:'cubic-bezier(.2,.7,.3,1)'}).onfinish = () => p.remove();
  }
}
const scopeOf = () => records.filter(r => (!$('fSection').value || r.section === $('fSection').value) && (!$('fSubject').value || r.subject_name === $('fSubject').value));
function fillSelect(id, label, vals){
  const s = $(id), cur = s.value; s.replaceChildren(...[''].concat(vals).map(v => { const o = el('option', null, v || label); o.value = v; return o; }));
  s.value = vals.includes(cur) ? cur : '';
}
function updateSel(){
  const n = sel.size, all = shownNow.length && shownNow.every(r => sel.has(r._id));
  $('selBtn').textContent = 'Apply to selected (' + n + ')'; $('selBtn').disabled = !n;
  $('selAll').textContent = all ? 'Clear selection' : 'Select all shown';
}

const nameBtn = r => { const b = el('button','nm lnk',r.student_name); b.type = 'button'; b.title = 'View attendance history'; b.onclick = e => { e.stopPropagation(); openHist(r); }; return b; };
const segCtl = (r, s, small, d = $('date').value) => { const g = el('div','sg' + (small ? ' sm' : '')); Object.keys(LABEL).forEach(k => { const b = el('button', k + (s === k ? ' on' : ''), LABEL[k]); b.type = 'button'; b.disabled = !d; b.title = s === k ? 'Click to clear' : 'Mark ' + LABEL[k].toLowerCase(); b.setAttribute('aria-pressed', s === k); b.onclick = e => { e.stopPropagation(); setSt(r, d, s === k ? '' : k); }; g.appendChild(b); }); return g; };
function render(){
  if ($('hdlg').open) renderHist();
  const day = $('date').value, q = $('search').value.trim().toLowerCase();
  const subs = [...new Set(records.map(r => r.subject_name))].sort(), secs = [...new Set(records.map(r => r.section))].sort();
  fillSelect('fSection','All sections',secs); fillSelect('fSubject','All subjects',subs);
  $('subjects').replaceChildren(...subs.map(s => { const o = el('option'); o.value = s; return o; }));
  $('sections').replaceChildren(...secs.map(s => { const o = el('option'); o.value = s; return o; }));
  [...sel].forEach(id => { if (!records.some(r => r._id === id)) sel.delete(id); });

  buildCls();
  const scoped = scopeOf(), days = [...new Set(scoped.flatMap(rec))].sort(), allDays = [...new Set(records.flatMap(rec))].sort(), ds = days.filter(k => k <= day);
  const rate = r => { const m = smap(r), dd = daysOf(r); let a = 0, n = 0; dd.forEach(k => { if (m[k] === 'excused') return; n++; if (m[k] === 'present' || m[k] === 'late') a++; }); return n ? a / n : (dd.length ? 1 : 0); };
  const S = r => statusOn(r, day), has = r => S(r) === 'present' || S(r) === 'late';
  const present = scoped.filter(has), absent = scoped.filter(r => S(r) === '' || S(r) === 'absent'), cnt = x => scoped.filter(r => S(r) === x).length;
  const base = scoped.filter(r => [r.student_name, r.subject_name, r.section].join(' ').toLowerCase().includes(q));
  const shown = base.filter(r => !stat || S(r) === (stat === 'unmarked' ? '' : stat)); shownNow = shown;
  const m = $('sort').value, byName = (a,b) => a.student_name.localeCompare(b.student_name);
  shown.sort((a,b) => m === 'most' ? rate(b) - rate(a) || byName(a,b) : m === 'least' ? rate(a) - rate(b) || byName(a,b) : byName(a,b));

  // chips + summary
  const bc = x => base.filter(r => S(r) === x).length; $('cAll').textContent = base.length; $('cPresent').textContent = bc('present'); $('cLate').textContent = bc('late'); $('cAbsent').textContent = bc('absent'); $('cExcused').textContent = bc('excused'); $('cUnm').textContent = bc('');
  document.querySelectorAll('.st').forEach(b => b.classList.toggle('on', b.dataset.st === stat));
  const pct = scoped.length ? Math.round(present.length / scoped.length * 100) : 0;
  $('sumTitle').textContent = day ? 'Session · ' + fmt(day, true) : 'Session';
  countUp($('gPct'), pct, '%'); $('ring').style.strokeDashoffset = 326.7 * (1 - pct / 100);
  $('gCnt').textContent = present.length + ' of ' + scoped.length + ' present';
  $('gSub').textContent = scoped.length ? cnt('late') + ' late · ' + cnt('absent') + ' absent · ' + cnt('excused') + ' excused · ' + cnt('') + ' not marked' : '';
  $('allBtn').disabled = $('restBtn').disabled = !cnt('') || !day; $('noneBtn').disabled = !scoped.some(r => S(r)); $('copyBtn').disabled = !scoped.length || !day;
  const wd = scoped.filter(r => daysOf(r).length), avg = wd.length ? Math.round(wd.reduce((n, r) => n + rate(r), 0) / wd.length * 100) : 0;
  countUp($('sStu'), records.length); countUp($('sSec'), secs.length); countUp($('sDays'), allDays.length); countUp($('sAvg'), avg, '%');
  $('count').textContent = records.length ? 'Showing ' + shown.length + ' of ' + records.length + ' students' : '';
  const flagged = scoped.map(r => ({ r, n: daysOf(r).length, rt: rate(r), run: absRun(r, daysOf(r).filter(k => k <= day), day) })).filter(x => (x.n > 1 && x.rt < THR.pct / 100) || x.run >= THR.run).sort((a2,b2) => b2.run - a2.run || a2.rt - b2.rt).slice(0, 10);
  $('warn').replaceChildren(...(flagged.length ? flagged.map(x => { const d = el('div'); d.append(el('span',null,x.r.student_name), el('b',null,[x.rt < THR.pct / 100 ? Math.round(x.rt * 100) + '%' : '', x.run >= THR.run ? x.run + ' absent in a row' : ''].filter(Boolean).join(' · '))); return d; }) : [el('div','empty', days.length > 1 ? 'No one needs attention.' : 'Needs at least 2 sessions.')]));

  // session ribbon
  const sd = [...new Set([...allDays, day].filter(Boolean))].sort(), rb = $('ribbon');
  rb.replaceChildren(...(sd.length ? sd.map(k => { const n = scoped.filter(r => keys(r).includes(k)).length, b = el('button','chip' + (k === day ? ' on' : ''), fmt(k) + ' · ' + n + '/' + scoped.length); b.type = 'button'; b.title = fmt(k, true); b.onclick = () => setDay(k); return b; }) : [el('span','empty','Recorded sessions appear here.')]));
  const on = rb.querySelector('.on'); if (on) rb.scrollTo({ left: on.offsetLeft - rb.clientWidth / 2 + on.clientWidth / 2, behavior: first ? 'auto' : 'smooth' });

  // roster
  const box = $('list'); box.replaceChildren(); updateSel();
  if (!shown.length){
    const s = el('div','state'), b = el('button','pb','+ Add student'); b.type = 'button'; b.onclick = openDlg;
    s.append(el('strong',null, records.length ? 'No matches' : 'No attendance yet'), el('span',null, records.length ? 'Try a different search or filter.' : 'Add your first student to start the roll call.'));
    if (!records.length) s.appendChild(b); box.appendChild(s); first = false; return;
  }
  const gm = $('group').value, keyOf = r => gm === 'section' ? r.section : gm === 'subject' ? r.subject_name : gm === 'both' ? r.section + ' · ' + r.subject_name : '';
  const groups = new Map(); shown.forEach(r => { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  let i = 0;
  const editBtn = (r, inl) => { const b = el('button','editb' + (inl ? ' inl' : ''),'✎'); b.type = 'button'; b.title = 'Edit student'; b.setAttribute('aria-label','Edit ' + r.student_name); b.onclick = e => { e.stopPropagation(); openEdit(r); }; return b; };
  const pick = (r, host) => { const c = el('input','pick'); c.type = 'checkbox'; c.checked = sel.has(r._id); c.setAttribute('aria-label','Select ' + r.student_name); c.onchange = () => { c.checked ? sel.add(r._id) : sel.delete(r._id); host.classList.toggle('sel', c.checked); updateSel(); }; host.classList.toggle('sel', c.checked); return c; };
  [...groups.keys()].sort().forEach(k => {
    const gr = groups.get(k);
    if (k){ const h = el('h3','gh', k); h.appendChild(el('small',null, gr.filter(has).length + ' / ' + gr.length + ' present'));
      if (gm === 'section' || gm === 'subject'){ const rb2 = el('button','gedit','✎ Rename'); rb2.type = 'button'; rb2.title = 'Rename for all students in this group'; rb2.onclick = () => renameGroup(gm === 'section' ? 'section' : 'subject_name', k); h.appendChild(rb2); }
      const gsu = [...new Set(gr.map(x => x.subject_name))], gse = [...new Set(gr.map(x => x.section))];
      const pre = { subject: gsu.length === 1 ? gsu[0] : (gm === 'subject' ? k : ''), section: gse.length === 1 ? gse[0] : (gm === 'section' ? k : '') };
      const ab = el('button','gedit gadd','+ Add student'); ab.type = 'button'; ab.title = 'Add a student to ' + k; ab.onclick = () => openDlg(pre); h.appendChild(ab);
      box.appendChild(h); }
    if (view === 'sheet'){
      const tw = el('div','tw'), t = el('table'), hd = el('tr');
      ['','Student','Subject','Section','Days','Rate','Status',''].forEach(x => hd.appendChild(el('th',null,x))); t.appendChild(el('thead')).appendChild(hd);
      const tb = el('tbody');
      gr.forEach(r => { const is = has(r), tr = el('tr', is ? 'is' : ''), td = () => tr.appendChild(el('td')), rt = Math.round(rate(r) * 100);
        const c0 = td(); c0.appendChild(pick(r, tr)); c0.firstChild.style.position = 'static';
        { const c1 = td(); c1.className = 'n'; c1.appendChild(nameBtn(r)); } td().textContent = r.subject_name; td().textContent = r.section; td().textContent = keys(r).length;
        const c5 = td(); c5.textContent = rt + '%'; if (daysOf(r).length > 1 && rt < THR.pct) c5.className = 'low'; td().appendChild(segCtl(r, S(r), true)); td().appendChild(editBtn(r, true)); tb.appendChild(tr); });
      t.appendChild(tb); tw.appendChild(t); box.appendChild(tw); return;
    }
    const grid = el('div','grid');
    gr.forEach(r => {
      const ks = keys(r), m = smap(r), s = m[day] || '', rt = rate(r), p = Math.round(rt * 100), low = daysOf(r).length > 1 && rt < THR.pct / 100;
      const c = el('article','card' + (s ? ' s-' + s : '') + (first ? ' in' : '') + (r._id === popId ? ' pop' : ''));
      if (first) c.style.animationDelay = Math.min(i++, 16) * 35 + 'ms';
      const av = el('div','av',r.student_name.trim().charAt(0).toUpperCase()); av.style.setProperty('--c', colorFor(r.student_name));
      const tags = el('div','tags'); tags.append(el('span','tag',r.subject_name), el('span','tag',r.section));
      const who = el('div'); who.append(nameBtn(r), tags); const w = el('div','who'); w.append(av, who);
      const heat = el('div','heat'); daysOf(r).slice(-12).forEach(d => { const h = el('span','hc ' + (m[d] || '')); h.title = fmt(d, true) + ': ' + (LABEL[m[d]] || 'Not marked'); heat.appendChild(h); });
      const meta = el('div','meta'), l = el('span'); const cl = Object.values(m).filter(x => x === 'late').length, ca = Object.values(m).filter(x => x === 'absent').length;
      l.append(el('b',null,ks.length + ' attended'), document.createTextNode(' · '), el('span', low ? 'low' : '', p + '%'), document.createTextNode((cl ? ' · ' + cl + ' late' : '') + (ca ? ' · ' + ca + ' absent' : '')));
      const dts = el('div','dts'), rd = Object.keys(m).sort(); if (rd.length > 4) dts.appendChild(el('span',null,'+' + (rd.length - 4) + ' earlier'));
      rd.slice(-4).forEach(k => { const x = el('span', m[k], fmt(k, true)); x.title = LABEL[m[k]]; dts.appendChild(x); }); if (!rd.length) dts.appendChild(el('span',null,'No dates yet'));
      meta.append(l); const run = absRun(r, daysOf(r).filter(k => k <= day), day); if (run >= THR.run) meta.appendChild(el('span','flag', run + ' absent in a row'));
      c.append(editBtn(r), pick(r, c), w, heat, dts, meta, segCtl(r, s)); grid.appendChild(c);
    });
    box.appendChild(grid);
  });
  first = false; popId = null;
}

async function api(method, p, retried){
  const key = store.get('key'), headers = { 'Content-Type': 'application/json' }; if (key) headers['x-api-key'] = key;
  const res = await fetch(VERCEL_API_URL, { method, headers, body: JSON.stringify(p) });
  if (res.status === 401 && !retried){ const k = prompt('This site is protected. Enter the passcode:'); if (k){ store.set('key', k.trim()); return api(method, p, true); } }
  if (!res.ok){ const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Server returned ' + res.status + (res.status === 405 ? ' (redeploy the backend)' : '')); }
  return res.json();
}
async function act(method, p, o = {}){
  const ex = records.find(r => same(r, p)), prev = ex ? statusOn(ex, p.date) : '', want = method === 'POST' ? (p.status || 'present') : '';
  if (ex && prev === want) { if (!o.quiet) toast(want ? 'Already ' + want : 'Already cleared'); return false; }
  pending++;
  try{
    const doc = await api(method, p), i = records.findIndex(r => r._id === doc._id);
    if (i > -1) records[i] = doc; else records.push(doc);
    setStatus(true); popId = doc._id;
    if (!o.quiet){
      render(); const card = document.querySelector('.card.pop'); if (card && want === 'present') burst(card);
      const back = () => prev ? act('POST', { ...p, status: prev }, { noUndo: true }) : act('DELETE', p, { noUndo: true });
      toast(want ? doc.student_name + ': ' + want : 'Cleared ' + fmt(p.date) + ' for ' + doc.student_name, o.noUndo ? null : back);
    }
    return true;
  }catch(err){ setStatus(false); toast('Could not save: ' + err.message); return false; }
  finally{ pending--; }
}
const setSt = (r, day, s) => day ? (s ? act('POST', { ...payload(r, day), status: s }) : act('DELETE', payload(r, day))) : toast('Pick a session date first');

async function loadRecords(silent){
  if (!silent){ const g = el('div','grid'); for (let i = 0; i < 6; i++) g.appendChild(el('div','skel')); $('list').replaceChildren(g); }
  $('refresh').classList.add('spin');
  try{
    const res = await fetch(VERCEL_API_URL);
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const data = await res.json(); if (pending) return;
    records = data; setStatus(true); render();
  }catch(err){
    setStatus(false);
    if (silent) return;
    const s = el('div','state'), b = el('button','pb','Try again'); b.type = 'button'; b.onclick = () => loadRecords();
    s.append(el('strong',null,'Records could not load'), el('span',null, err.message + '. Check your connection and that the API is running.'), b); $('list').replaceChildren(s);
  }finally{ $('refresh').classList.remove('spin'); }
}

async function bulk(status, todo, label){
  const day = $('date').value;
  if (!todo.length) return toast('Nothing to change for this date');
  if (!confirm(label + ' ' + todo.length + (todo.length === 1 ? ' student' : ' students') + ' on ' + fmt(day, true) + '?')) return;
  const prevs = todo.map(r => [r, statusOn(r, day)]); let n = 0; toast('Working…');
  for (const r of todo){ if (await act(status ? 'POST' : 'DELETE', status ? { ...payload(r, day), status } : payload(r, day), { quiet: true })) n++; }
  sel.clear(); render();
  toast(n + (n === 1 ? ' student' : ' students') + ' updated', async () => { for (const [r, s] of prevs){ const cur = records.find(x => x._id === r._id) || r; await act(s ? 'POST' : 'DELETE', s ? { ...payload(cur, day), status: s } : payload(cur, day), { quiet: true }); } render(); toast('Reverted'); });
}
const absentList = () => { const day = $('date').value; return scopeOf().filter(r => ['', 'absent'].includes(statusOn(r, day))); };
const unmarkedList = () => { const day = $('date').value; return scopeOf().filter(r => !statusOn(r, day)); };

function exportCsv(){
  buildCls();
  const sc = scopeOf(); if (!sc.length) return toast('Nothing to export yet.');
  const days = [...new Set(sc.flatMap(rec))].sort(), q = v => '"' + String(v).replace(/"/g,'""') + '"', L = { present:'P', late:'L', absent:'A', excused:'E' };
  const rows = [['Student','Subject','Section','Joined',...days.map(k => fmt(k, true)),'Present','Late','Absent','Excused','Rate'].map(q).join(',')];
  sc.forEach(r => { const m = smap(r), v = Object.values(m), c = x => v.filter(y => y === x).length, dd = daysOf(r), den = dd.filter(k => m[k] !== 'excused').length, att = dd.filter(k => m[k] === 'present' || m[k] === 'late').length;
    rows.push([r.student_name, r.subject_name, r.section, startOf(r), ...days.map(k => L[m[k]] || ''), c('present'), c('late'), c('absent'), c('excused'), den > 0 ? Math.round(att / den * 100) + '%' : '0%'].map(q).join(',')); });
  const a = el('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv' })); a.download = 'attendance-' + todayKey() + '.csv'; a.click(); URL.revokeObjectURL(a.href); toast('CSV downloaded');
}
async function copyAbsent(){
  const day = $('date').value, sc = scopeOf();
  if (!day || !sc.length) return toast('Nothing to copy yet');
  const S = r => statusOn(r, day), byName = (a, b) => a.student_name.localeCompare(b.student_name), total = x => sc.filter(r => S(r) === x).length, groups = new Map();
  sc.forEach(r => { const k = r.section + ' - ' + r.subject_name; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  const out = ['ATTENDANCE REPORT', at(day).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}), '',
    'Present ' + total('present') + ' | Late ' + total('late') + ' | Absent ' + total('absent') + ' | Excused ' + total('excused') + ' | Not marked ' + total('') + '  (' + sc.length + ' students)'];
  [...groups.keys()].sort().forEach(k => {
    const gr = groups.get(k), here = gr.filter(r => S(r) === 'present' || S(r) === 'late').length; let any = false;
    out.push('', k + '  [' + here + '/' + gr.length + ' present]');
    [['absent','Absent'],['','Not marked'],['late','Late'],['excused','Excused']].forEach(([st, label]) => {
      const list = gr.filter(r => S(r) === st).sort(byName); if (!list.length) return; any = true;
      out.push('  ' + label + ' (' + list.length + '):'); list.forEach((r, i) => out.push('    ' + (i + 1) + '. ' + r.student_name));
    });
    if (!any) out.push('  Everyone present');
  });
  try { await navigator.clipboard.writeText(out.join('\n')); toast('Attendance report copied'); } catch(e){ toast('Copy is not available in this browser'); }
}
function setDay(k){ if (k) { $('date').value = k; render(); } }
function setView(v){ view = v; store.set('view', v); $('vCards').classList.toggle('on', v === 'cards'); $('vSheet').classList.toggle('on', v === 'sheet'); render(); }
function openDlg(pre){ if (pre && typeof pre.subject === 'string'){ $('subject').value = pre.subject; $('section').value = pre.section; } else { if ($('fSubject').value) $('subject').value = $('fSubject').value; if ($('fSection').value) $('section').value = $('fSection').value; } $('dlg').showModal(); $('student').focus(); }
function setTheme(t){ document.documentElement.dataset.theme = t; store.set('theme', t); }
const recorded = () => [...new Set(records.flatMap(rec))].sort();

let editing = null;
function openEdit(r){ editing = r; $('eName').value = r.student_name; $('eSubject').value = r.subject_name; $('eSection').value = r.section; $('eStart').value = r.start_date ? dayKey(r.start_date) : startOf(r); $('edlg').showModal(); $('eName').focus(); }
async function renameGroup(field, from){
  const to = (prompt('Rename "' + from + '" for all its students:', from) || '').trim();
  if (!to || to === from) return;
  pending++;
  try{ await api('PATCH', { rename: { field, from, to } }); records.forEach(r => { if (r[field] === from) r[field] = to; }); setStatus(true); render(); toast('Renamed to ' + to); }
  catch(err){ toast('Could not rename: ' + err.message); }
  finally{ pending--; }
}
$('eForm').addEventListener('submit', async e => {
  e.preventDefault(); const b = $('eSave'); b.disabled = true; pending++;
  try{
    const body = { id: editing._id, student_name: $('eName').value, subject_name: $('eSubject').value, section: $('eSection').value }, sv = $('eStart').value;
    if (sv !== (editing.start_date ? dayKey(editing.start_date) : startOf(editing))) body.start_date = sv;
    const doc = await api('PATCH', body);
    const i = records.findIndex(r => r._id === doc._id); if (i > -1) records[i] = doc;
    setStatus(true); $('edlg').close(); render(); toast('Saved changes for ' + doc.student_name);
  }catch(err){ toast('Could not save: ' + err.message); }
  finally{ b.disabled = false; pending--; }
});
$('eDelete').onclick = async () => {
  if (!editing || !confirm('Delete ' + editing.student_name + ' and all their attendance dates? This cannot be undone.')) return;
  pending++;
  const snap = JSON.parse(JSON.stringify(editing));
  try{ await api('DELETE', { student_id: editing._id }); records = records.filter(r => r._id !== snap._id); sel.delete(snap._id); setStatus(true); $('edlg').close(); render();
    toast('Deleted ' + snap.student_name, async () => { try { const doc = await api('POST', { restore: snap }); records.push(doc); render(); toast('Restored ' + doc.student_name); } catch(err){ toast('Could not restore: ' + err.message); } }); }
  catch(err){ toast('Could not delete: ' + err.message); }
  finally{ pending--; }
};
$('eCancel').onclick = () => $('edlg').close();
$('edlg').addEventListener('click', e => { if (e.target === $('edlg')) $('edlg').close(); });
// ---- student history
let histId = null;
const sessionsFor = r => [...new Set(records.filter(x => x.section === r.section && x.subject_name === r.subject_name).flatMap(rec))];
function openHist(r){ histId = r._id; renderHist(); if (!$('hdlg').open) $('hdlg').showModal(); }
function renderHist(){
  const r = records.find(x => x._id === histId); if (!r){ $('hdlg').close(); return; }
  const m = smap(r), all = [...new Set([...sessionsFor(r), ...rec(r)])].sort().reverse(), c = x => Object.values(m).filter(y => y === x).length;
  buildCls(); const dd = daysOf(r), att = dd.filter(k => m[k] === 'present' || m[k] === 'late').length, den = dd.filter(k => m[k] !== 'excused').length, run = absRun(r, dd.filter(k => k <= $('date').value), $('date').value);
  $('hTitle').textContent = r.student_name; $('hSub').textContent = r.subject_name + ' · ' + r.section + ' · counting from ' + (startOf(r) ? fmt(startOf(r), true) : 'the first session') + (run >= THR.run ? ' · ' + run + ' absent in a row' : '');
  $('hStats').replaceChildren(...[['Attended', att], ['Late', c('late')], ['Absent', c('absent')], ['Excused', c('excused')], ['Rate', (den > 0 ? Math.round(att / den * 100) : 0) + '%']].map(([k, v]) => { const d = el('div'); d.append(el('b',null,String(v)), el('span',null,k)); return d; }));
  $('hList').replaceChildren(...(all.length ? all.map(k => { const row = el('div','hrow'), l = el('div'); if (k < startOf(r)){ row.style.opacity = .55; row.title = 'Before the joined date, so not counted'; } l.append(el('b',null,fmt(k, true)), el('small',null,at(k).toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}))); row.append(l, segCtl(r, m[k] || '', true, k)); return row; }) : [el('div','empty','No sessions recorded yet.')]));
}
$('hAddBtn').onclick = () => { const r = records.find(x => x._id === histId), d = $('hAdd').value; if (r && d) { setSt(r, d, 'present'); $('hAdd').value = ''; } else toast('Pick a date to add'); };
$('hEdit').onclick = () => { const r = records.find(x => x._id === histId); $('hdlg').close(); if (r) openEdit(r); };
$('hClose').onclick = () => $('hdlg').close();
$('hdlg').addEventListener('click', e => { if (e.target === $('hdlg')) $('hdlg').close(); });

// ---- add several students
function openBulk(){ $('bSubject').value = $('fSubject').value || $('subject').value; $('bSection').value = $('fSection').value || $('section').value; $('bdlg').showModal(); $('bNames').focus(); }
$('toBulk').onclick = () => { $('dlg').close(); openBulk(); };
$('bCancel').onclick = () => $('bdlg').close();
$('bdlg').addEventListener('click', e => { if (e.target === $('bdlg')) $('bdlg').close(); });
$('bForm').addEventListener('submit', async e => {
  e.preventDefault();
  const sub = $('bSubject').value.trim(), sec = $('bSection').value.trim(), st = $('bStatus').value, day = $('date').value || todayKey(), seen = new Set();
  const names = $('bNames').value.split(/\r?\n/).map(x => x.replace(/\s+/g,' ').trim()).filter(x => x && x.length <= 100 && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
  if (!names.length) return toast('Enter at least one name');
  const b = $('bSave'); b.disabled = true; pending++; const created = []; let n = 0, dup = 0;
  try{
    for (const name of names){
      b.textContent = 'Adding ' + (n + dup + 1) + ' of ' + names.length + '…';
      const doc = await api('POST', { student_name: name, subject_name: sub, section: sec, date: day, status: st }), i = records.findIndex(r => r._id === doc._id);
      if (i > -1){ records[i] = doc; dup++; } else { records.push(doc); created.push(doc._id); n++; }
    }
    setStatus(true); $('bdlg').close(); $('bNames').value = ''; render();
    toast('Added ' + n + (n === 1 ? ' student' : ' students') + (dup ? ', ' + dup + ' already existed' : ''), n ? async () => { for (const id of created){ try { await api('DELETE', { student_id: id }); } catch(e2){} records = records.filter(r => r._id !== id); } render(); toast('Removed the students you just added'); } : null);
  }catch(err){ setStatus(false); render(); toast('Stopped: ' + err.message); }
  finally{ b.disabled = false; b.textContent = 'Add students'; pending--; }
});
// ---- alert thresholds
$('tPct').value = THR.pct; $('tRun').value = THR.run;
['tPct','tRun'].forEach(id => $(id).addEventListener('change', () => { const v = Math.max(1, Math.min(100, parseInt($(id).value) || (id === 'tPct' ? 75 : 2))); $(id).value = v; THR[id === 'tPct' ? 'pct' : 'run'] = v; store.set(id, v); render(); }));
$('addBtn').onclick = openDlg; $('csvBtn').onclick = exportCsv; $('copyBtn').onclick = copyAbsent; $('refresh').onclick = () => loadRecords(true);
$('allBtn').onclick = () => bulk('present', unmarkedList(), 'Mark as present:'); $('restBtn').onclick = () => bulk('absent', unmarkedList(), 'Mark as absent:'); $('noneBtn').onclick = () => bulk('', scopeOf().filter(r => statusOn(r, $('date').value)), 'Clear');
$('selBtn').onclick = () => bulk($('selSt').value, records.filter(r => sel.has(r._id)), 'Set ' + $('selSt').value + ' for');
$('selAll').onclick = () => { const all = shownNow.every(r => sel.has(r._id)); shownNow.forEach(r => all ? sel.delete(r._id) : sel.add(r._id)); render(); };
$('first').onclick = () => { const d = recorded(); d.length ? setDay(d[0]) : toast('No sessions recorded yet'); };
$('last').onclick = () => { const d = recorded(); d.length ? setDay(d[d.length - 1]) : toast('No sessions recorded yet'); };
$('prev').onclick = () => setDay(shift($('date').value || todayKey(), -1)); $('next').onclick = () => setDay(shift($('date').value || todayKey(), 1)); $('today').onclick = () => setDay(todayKey());
$('vCards').onclick = () => setView('cards'); $('vSheet').onclick = () => setView('sheet');
document.querySelectorAll('.st').forEach(b => b.onclick = () => { stat = b.dataset.st; render(); });
$('cancel').onclick = () => $('dlg').close();
$('dlg').addEventListener('click', e => { if (e.target === $('dlg')) $('dlg').close(); });
$('dataForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('submitBtn'), label = btn.textContent; btn.disabled = true; btn.textContent = 'Saving…';
  const ok = await act('POST', { student_name: $('student').value.trim(), subject_name: $('subject').value.trim(), section: $('section').value.trim(), date: $('date').value });
  btn.disabled = false; btn.textContent = label;
  if (ok){ $('student').value = ''; $('dlg').close(); }
});
['date','fSection','fSubject'].forEach(id => $(id).addEventListener('change', render));
['group','sort'].forEach(id => $(id).addEventListener('change', () => { store.set(id, $(id).value); render(); }));
$('search').addEventListener('input', render);
$('themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
document.addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || document.querySelector('dialog[open]') || e.metaKey || e.ctrlKey) return;
  if (e.key === '/') { e.preventDefault(); $('search').focus(); }
  else if (e.key === 'ArrowLeft') $('prev').click(); else if (e.key === 'ArrowRight') $('next').click();
});
setInterval(() => { if (!document.hidden && !pending) loadRecords(true); }, 45000);

setTheme(store.get('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
['group','sort'].forEach(id => { const v = store.get(id); if (v && [...$(id).options].some(o => o.value === v)) $(id).value = v; });
view = store.get('view') === 'sheet' ? 'sheet' : 'cards'; $('vCards').classList.toggle('on', view === 'cards'); $('vSheet').classList.toggle('on', view === 'sheet');
$('date').value = todayKey();
loadRecords();