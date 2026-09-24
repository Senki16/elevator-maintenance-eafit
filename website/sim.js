/* LiftCare — maintenance plan simulator (illustrative assumptions) */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const fmt = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const BRANDS = [['Estilo', '#ff9500'], ['Schindler', '#0071e3'], ['Mitsubishi', '#ff3b30']];
  const SERVICE_HOURS = 12 * 365; // hours per year an elevator is expected to be available

  /* cost-model assumptions (from 02_Analysis/elevator_cost_analysis.py) */
  const A = { n: 12, maint: 18, energy: 6, capex: 80, eSave: 30, mSave: 15, strict: 10, reduce: 2, years: 5 };

  /* maintenance plans: cadences, failure rates and repair times are illustrative */
  const PLANS = {
    current: {
      name: 'Current · NTC 5926-1', color: '#86868b',
      desc: 'Monthly preventive visit by the contractor and an annual third-party inspection against NTC 5926-1. Failures are fixed when they happen.',
      prev: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], prevH: 3, safe: [], safeH: 0, insp: 1, inspH: 6, pred: 0, predH: 0, remote: false,
      fail: 2.0, repairH: 12,
    },
    strict: {
      name: 'Stricter standard', color: '#af52de',
      desc: 'Adopts a stricter foreign regime (EN 81-80 / EN 13015 style): monthly visits, quarterly safety-gear and brake tests, and two third-party inspections a year.',
      prev: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], prevH: 3, safe: [1, 4, 7, 10], safeH: 4, insp: 2, inspH: 6, pred: 0, predH: 0, remote: false,
      fail: 1.2, repairH: 10,
    },
    predictive: {
      name: 'Predictive · modernised', color: '#34c759',
      desc: 'Modernised units with remote monitoring, as Schindler and Mitsubishi offer: preventive visits every two months, condition-based interventions and an annual inspection.',
      prev: [0, 2, 4, 6, 8, 10], prevH: 3, safe: [], safeH: 0, insp: 1, inspH: 5, pred: 3, predH: 2, remote: true,
      fail: 0.6, repairH: 6,
    },
    reduced: {
      name: 'Reduced fleet', color: '#ff9500',
      desc: 'Keeps the current regime but retires two elevators. Cheaper to run, at the cost of waiting time and accessibility for the rest of the campus.',
      prev: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], prevH: 3, safe: [], safeH: 0, insp: 1, inspH: 6, pred: 0, predH: 0, remote: false,
      fail: 2.0, repairH: 12,
    },
  };

  /* deterministic pseudo-random so the schedule is stable between reloads */
  const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = (r, k, avoid) => {
    const out = new Set(); let guard = 0;
    while (out.size < k && guard++ < 200) { const m = Math.floor(r() * 12); if (!avoid || !avoid.has(m)) out.add(m); }
    return [...out];
  };

  /* annual costs per strategy (M COP) — mirrors the Python model */
  function costs() {
    const base = A.n * (A.maint + A.energy);
    const strict = base * (1 + A.strict / 100);
    const modAnnual = A.n * (A.maint * (1 - A.mSave / 100) + A.energy * (1 - A.eSave / 100));
    const modCapex = A.n * A.capex;
    const reduced = Math.max(0, A.n - A.reduce) * (A.maint + A.energy);
    return {
      current: { y0: 0, annual: base },
      strict: { y0: 0, annual: strict },
      predictive: { y0: modCapex, annual: modAnnual },
      reduced: { y0: 0, annual: reduced },
    };
  }

  let plan = 'current', month = 0, timer = null, sched = [];

  function buildSchedule() {
    const P = PLANS[plan];
    const active = plan === 'reduced' ? Math.max(0, A.n - A.reduce) : A.n;
    sched = [];
    for (let i = 0; i < A.n; i++) {
      const r = rng(1000 + i * 97 + (plan === 'current' ? 0 : plan.length * 13));
      const retired = i >= active;
      const cells = [...Array(12)].map(() => []);
      if (!retired) {
        const off = i % 3; // stagger contractor visits
        P.prev.forEach((m) => cells[(m + (P.prev.length < 12 ? off % 2 : 0)) % 12].push('prev'));
        P.safe.forEach((m) => cells[(m + off) % 12].push('safe'));
        const insp = P.insp === 2 ? [i % 12, (i + 6) % 12] : [i % 12];
        insp.forEach((m) => cells[m].push('insp'));
        if (P.remote) cells.forEach((c) => c.push('rem'));
        pick(r, P.pred).forEach((m) => cells[m].push('pred'));
        const nf = Math.floor(P.fail) + (r() < P.fail % 1 ? 1 : 0);
        pick(r, nf).forEach((m) => cells[m].push('fail'));
      }
      sched.push({ id: `L${String(i + 1).padStart(2, '0')}`, brand: BRANDS[i % 3], retired, cells });
    }
  }

  function planStats(key) {
    const P = PLANS[key];
    const active = key === 'reduced' ? Math.max(0, A.n - A.reduce) : A.n;
    const visits = active * (P.prev.length + P.safe.length + P.insp + P.pred);
    const hours = active * (P.prev.length * P.prevH + P.safe.length * P.safeH + P.insp * P.inspH + P.pred * P.predH);
    const failures = active * P.fail;
    const downPer = P.prev.length * P.prevH + P.safe.length * P.safeH + P.insp * P.inspH + P.pred * P.predH + P.fail * P.repairH;
    const avail = 100 * (1 - downPer / SERVICE_HOURS);
    const c = costs()[key];
    return { active, visits, hours, failures, downPer, avail, annual: c.annual, five: c.y0 + c.annual * A.years, y0: c.y0 };
  }

  function renderKPIs() {
    const s = planStats(plan), b = planStats('current');
    const d = (v, ref, better, unit = '', dec = 0) => {
      if (plan === 'current') return '<span class="d muted">baseline</span>';
      const x = v - ref; if (Math.abs(x) < 1e-9) return '<span class="d muted">same as current</span>';
      const good = better === 'low' ? x < 0 : x > 0;
      return `<span class="d ${good ? 'up' : 'down'}">${x > 0 ? '+' : '−'}${fmt(Math.abs(x), dec)}${unit} vs. current</span>`;
    };
    $('#kpis').innerHTML = [
      ['Active elevators', fmt(s.active), '', d(s.active, b.active, 'high')],
      ['Planned visits per year', fmt(s.visits), '', d(s.visits, b.visits, 'low')],
      ['Expected failures per year', fmt(s.failures, 1), '', d(s.failures, b.failures, 'low', '', 1)],
      ['Downtime per elevator', fmt(s.downPer), 'h/yr', d(s.downPer, b.downPer, 'low', ' h')],
      ['Availability', fmt(s.avail, 2), '%', d(s.avail, b.avail, 'high', ' pts', 2)],
      ['5-year cost', fmt(s.five), 'M COP', d(s.five, b.five, 'low', ' M')],
    ].map(([l, v, u, dd]) => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}<small>${u}</small></span>${dd}</div>`).join('');
  }

  function renderCalendar() {
    const cal = $('#cal');
    let h = '<div></div>' + MONTHS.map((m, i) => `<div class="h${i === month ? ' now' : ''}">${m.slice(0, 3)}</div>`).join('');
    sched.forEach((e) => {
      h += `<div class="e"><i style="background:${e.brand[1]}"></i>${e.id} · ${e.brand[0]}</div>`;
      e.cells.forEach((c, m) => {
        const chips = c.filter((k) => k !== 'rem').map((k) => `<span class="chip k-${k}"></span>`).join('') + (c.includes('rem') ? '<span class="chip k-rem" style="opacity:.45"></span>' : '');
        const title = e.retired ? 'Retired' : (c.length ? c.map(label).join(', ') : 'In service');
        h += `<div class="c${e.retired ? ' off' : ''}${m === month ? ' now' : ''}" title="${e.id} · ${MONTHS[m]}: ${title}">${chips}</div>`;
      });
    });
    cal.innerHTML = h;
  }
  const label = (k) => ({ prev: 'Preventive visit', safe: 'Safety test', insp: 'Third-party inspection', pred: 'Predictive intervention', fail: 'Failure and repair', rem: 'Remote monitoring' }[k]);

  function renderFleet() {
    $('#fleet-m').textContent = MONTHS[month];
    const pri = ['fail', 'insp', 'safe', 'pred', 'prev'];
    const cls = { fail: 'fail', insp: 'insp', safe: 'safe', pred: 'pred', prev: 'maint' };
    const txt = { fail: ['Out of service', '#ff3b30'], insp: ['Inspection', '#af52de'], safe: ['Safety test', '#ff9500'], pred: ['Predictive fix', '#34c759'], prev: ['Preventive visit', '#0071e3'] };
    let busy = 0, down = 0; const tasks = [];
    $('#fleet').innerHTML = sched.map((e) => {
      if (e.retired) return `<div class="lift retired"><span class="n">${e.id}<small>${e.brand[0]}</small></span><span class="s"><i class="dot" style="background:#86868b"></i>Retired</span><span class="bar"><i style="width:0"></i></span></div>`;
      const c = e.cells[month]; const top = pri.find((k) => c.includes(k));
      c.filter((k) => k !== 'rem').forEach((k) => tasks.push([e.id, e.brand[0], k]));
      if (top) busy++; if (c.includes('fail')) down++;
      // health: months since the last preventive/predictive work, lower after a failure
      let since = 0; for (let m = month; m >= 0 && !e.cells[m].some((k) => ['prev', 'pred'].includes(k)); m--) since++;
      const health = Math.max(35, 100 - since * 18 - (c.includes('fail') ? 45 : 0));
      const [t, col] = top ? txt[top] : ['In service', '#34c759'];
      return `<div class="lift ${top ? cls[top] : ''}"><span class="n">${e.id}<small>${e.brand[0]}</small></span><span class="s"><i class="dot" style="background:${col}"></i>${t}</span><span class="bar" title="Condition index ${health}%"><i style="width:${health}%;background:${health > 70 ? '#34c759' : health > 50 ? '#ff9500' : '#ff3b30'}"></i></span></div>`;
    }).join('');
    const act = sched.filter((e) => !e.retired).length;
    $('#fleet-sum').textContent = `${busy} with scheduled work · ${down} expected failure${down === 1 ? '' : 's'}`;
    $('#tasks').innerHTML = tasks.length ? tasks.map(([id, br, k]) => `<li><span class="chip k-${k}"></span><b>${id}</b> ${br} · ${label(k)}</li>`).join('') : '<li class="muted">No scheduled work this month.</li>';
  }

  function setMonth(m) {
    month = m; $('#month').value = m; $('#month-l').textContent = MONTHS[m];
    renderCalendar(); renderFleet();
  }

  function setPlan(p) {
    plan = p;
    document.querySelectorAll('#plan-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.p === p));
    $('#plan-desc').textContent = PLANS[p].desc;
    buildSchedule(); renderKPIs(); setMonth(month); renderCost();
  }

  /* ---------- cost chart & table ---------- */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const el = (t, a, p) => { const e = document.createElementNS(SVGNS, t); for (const k in a) e.setAttribute(k, a[k]); p && p.appendChild(e); return e; };
  function renderCost() {
    const C = costs(); const keys = ['current', 'strict', 'predictive', 'reduced'];
    const series = keys.map((k) => { const s = [C[k].y0]; for (let y = 1; y <= A.years; y++) s.push(s[y - 1] + C[k].annual); return s; });
    const svg = $('#cost-chart'); svg.innerHTML = '';
    const W = 560, H = 300, L = 52, R = 16, T = 14, B = 30;
    const max = Math.max(...series.flat()) * 1.08 || 1;
    const x = (i) => L + (i / A.years) * (W - L - R), y = (v) => H - B - (v / max) * (H - T - B);
    const step = Math.pow(10, Math.floor(Math.log10(max / 4))); const tick = Math.ceil(max / 4 / step) * step;
    for (let v = 0; v <= max; v += tick) { el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: v ? '#e8e8ed' : '#d2d2d7' }, svg); el('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }, svg).textContent = fmt(v); }
    for (let i = 0; i <= A.years; i++) el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' }, svg).textContent = i ? `Year ${i}` : 'Now';
    series.forEach((s, j) => {
      const k = keys[j], on = k === plan;
      el('polyline', { points: s.map((v, i) => `${x(i)},${y(v)}`).join(' '), fill: 'none', stroke: PLANS[k].color, 'stroke-width': on ? 3.5 : 2, opacity: on ? 1 : 0.55, 'stroke-linejoin': 'round' }, svg);
      s.forEach((v, i) => el('circle', { cx: x(i), cy: y(v), r: on ? 4 : 2.5, fill: '#fff', stroke: PLANS[k].color, 'stroke-width': 2, opacity: on ? 1 : 0.55 }, svg));
    });
    $('#cost-legend').innerHTML = keys.map((k) => `<span><i class="chip" style="background:${PLANS[k].color};width:10px;height:10px"></i>${PLANS[k].name}</span>`).join('');
    const base5 = series[0][A.years];
    $('#cost-table').innerHTML = '<thead><tr><th>Strategy</th><th>Year-0</th><th>Annual</th><th>5-year</th><th>vs. current</th></tr></thead><tbody>' +
      keys.map((k, j) => { const sv = base5 - series[j][A.years]; return `<tr${k === plan ? ' style="font-weight:600"' : ''}><td><i class="chip" style="display:inline-block;background:${PLANS[k].color};margin-right:8px"></i>${PLANS[k].name}</td><td>${fmt(C[k].y0, 1)}</td><td>${fmt(C[k].annual, 1)}</td><td>${fmt(series[j][A.years], 1)}</td><td class="${sv > 0 ? 'up' : sv < 0 ? 'down' : ''}">${sv > 0 ? '+' : ''}${fmt(sv, 1)}</td></tr>`; }).join('') + '</tbody>';
    const perUnitSave = A.maint * A.mSave / 100 + A.energy * A.eSave / 100;
    const payback = perUnitSave > 0 ? A.capex / perUnitSave : Infinity;
    $('#payback').innerHTML = `Millions of COP; positive "vs. current" means a saving. Modernisation saves COP ${fmt(perUnitSave, 1)} M per elevator per year against COP ${fmt(A.capex)} M of investment: a simple payback of <b>${isFinite(payback) ? fmt(payback, 1) + ' years' : 'never'}</b>${payback > A.years ? ', beyond the evaluation horizon' : ''}.`;
  }

  /* ---------- assumptions ---------- */
  const SL = [
    ['n', 'Elevators on campus', 6, 20, 1, ''], ['maint', 'Maintenance per elevator', 6, 40, 1, ' M/yr'], ['energy', 'Energy per elevator', 2, 15, 0.5, ' M/yr'],
    ['capex', 'Modernisation per elevator', 30, 200, 5, ' M'], ['eSave', 'Energy saving after modernising', 0, 60, 1, '%'], ['mSave', 'Maintenance saving after modernising', 0, 50, 1, '%'],
    ['strict', 'Extra cost of stricter standard', 0, 40, 1, '%'], ['reduce', 'Elevators removed', 0, 6, 1, ''], ['years', 'Evaluation horizon', 3, 15, 1, ' years'],
  ];
  $('#assump').innerHTML = SL.map(([k, l, mn, mx, st, u]) => `<label>${l} <b id="a-${k}">${fmt(A[k], st < 1 ? 1 : 0)}${u}</b><input type="range" data-k="${k}" data-u="${u}" min="${mn}" max="${mx}" step="${st}" value="${A[k]}"></label>`).join('');
  document.querySelectorAll('#assump input').forEach((inp) => inp.addEventListener('input', () => {
    const k = inp.dataset.k; A[k] = +inp.value;
    $('#a-' + k).textContent = fmt(A[k], +inp.step < 1 ? 1 : 0) + inp.dataset.u;
    if (k === 'n') { $('#n').value = A.n; $('#n-val').textContent = A.n; }
    buildSchedule(); renderKPIs(); renderCalendar(); renderFleet(); renderCost();
  }));
  $('#n').addEventListener('input', (e) => {
    A.n = +e.target.value; $('#n-val').textContent = A.n;
    const s = document.querySelector('#assump input[data-k="n"]'); s.value = A.n; $('#a-n').textContent = A.n;
    buildSchedule(); renderKPIs(); renderCalendar(); renderFleet(); renderCost();
  });

  /* ---------- controls ---------- */
  document.querySelectorAll('#plan-tabs button').forEach((b) => (b.onclick = () => setPlan(b.dataset.p)));
  $('#month').addEventListener('input', (e) => setMonth(+e.target.value));
  const icPlay = '<path d="M7 4v16l13-8z"/>', icPause = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
  $('#play').onclick = () => {
    if (timer) { clearInterval(timer); timer = null; $('#play-ic').innerHTML = icPlay; return; }
    $('#play-ic').innerHTML = icPause;
    if (month === 11) setMonth(0);
    timer = setInterval(() => {
      if (month >= 11) { clearInterval(timer); timer = null; $('#play-ic').innerHTML = icPlay; return; }
      setMonth(month + 1);
    }, 1100);
  };

  setPlan('current');
})();
