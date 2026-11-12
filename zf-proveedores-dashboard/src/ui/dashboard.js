/**
 * Interfaz del dashboard: filtros, pestañas, gráficas (d3), tablas y ficha de decisión.
 * Recibe un "store" con la misma forma que la API del entorno original:
 * store.data(id), store.params(), store.setParams(), store.resetParams(), store.setLink(), store.onData().
 */
import * as d3 from 'd3';

export function mountDashboard(store) {
  const TABS = ['desempeno', 'integridad', 'dependencia', 'pronostico'];
  const zf = {
    q: '', note: '', first: true,
    tab: TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'desempeno',
    sort: Object.fromEntries(['main', 'rfq', 'alertas', 'integ', 'depc', 'depp', 'pron', 'modelo'].map((k) => [k, { field: null, dir: 1 }])),
  };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const enc = (v) => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const si = (v) => v === true || v === 'true';
  const F = {
    int: d3.format(','),
    eur: (v) => (v === null || v === undefined || v === '' ? '—' : `${d3.format(',')(Math.round(v))} €`),
    pct: (v) => (v === null || v === undefined || v === '' ? '—' : d3.format('.0%')(v)),
    meur: d3.format(',.1f'),
    compact: (v) => new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(v),
  };
  const CCOLOR = { S: 'var(--cds-chart-categorical-1)', A: 'var(--cds-chart-categorical-7)', Z: 'var(--cds-chart-categorical-3)', U: 'var(--cds-chart-categorical-5)', G: 'var(--cds-chart-muted)' };
  const QCLASS = { 'Bloqueado': 'q-blk', 'Rojo': 'q-red', 'Amarillo': 'q-yel', 'Verde': 'q-grn', 'Azul': 'q-blu', 'Gris – Mantener': 'q-gry', 'Gris – Salida': 'q-gry' };
  const VCLASS = { 'No apto': 'q-red', 'Apto condicionado': 'q-yel', 'Apto': 'q-grn' };
  const ECLASS = { 'Excluido': 'q-red', 'No elegible (PCF)': 'q-yel', 'Elegible condicionado': 'q-gry', 'Elegible': 'q-grn', 'Elegible · prioritario': 'q-grn' };
  const SCLASS = { 'Alta': 'q-red', 'Media': 'q-yel', 'Baja': 'q-gry' };
  const GCLASS = { 'Deterioro estructural': 'q-red', 'Bache temporal': 'q-yel', 'Vigilar': 'q-blu', 'Sin pronóstico': 'q-gry', 'Estable': 'q-grn' };
  const DCLASS = { 'Dependencia innecesaria': 'q-red', 'Dependencia sin alternativa': 'q-red', 'Dependencia estratégica': 'q-yel', 'Diversificado': 'q-gry', 'Sin dependencia relevante': 'q-gry' };
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mesCorto = (m) => MESES.at(Number(String(m).slice(5, 7)) - 1);
  const PCT_PARAMS = new Set(['tolerancia_precio', 'tolerancia_gasto', 'umbral_dependencia', 'umbral_dependencia_inversa', 'umbral_prob']);

  const rowsOf = (id) => { const d = store.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const statusOf = (id) => store.data(id).status;
  const failed = (el, text = 'No se pudo cargar', info = false) => { const f = document.createElement('div'); f.className = 'zf-fail' + (info ? ' is-info' : ''); f.textContent = text; el.replaceChildren(f); };
  const show = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
  const cite = (el, src, field, where, text) => {
    el.dataset.source = src; el.dataset.field = field;
    if (where) el.dataset.where = where; else delete el.dataset.where;
    el.textContent = show(text);
  };
  const badge = (cls, text) => { const s = document.createElement('span'); s.className = 'zf-b ' + (cls || ''); s.textContent = text; return s; };
  const unskel = (...els) => els.forEach((e) => e && e.classList.remove('dash-skeleton'));
  const styleAxis = (a) => {
    a.attr('font-size', null).attr('font-family', null);
    a.selectAll('.domain, line').style('stroke', 'var(--cds-chart-axis)');
    a.selectAll('text').style('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)');
  };
  const cap = (sel) => sel.style('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)');
  const tipFor = (box) => box.parentElement.querySelector('.zf-tip');
  function tipShow(box, event, lines) {
    const tip = tipFor(box), wrap = box.parentElement;
    tip.replaceChildren(...lines.map(([c, t]) => { const s = document.createElement('span'); if (c) s.className = c; s.textContent = t; return s; }));
    tip.hidden = false;
    const R = wrap.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let lx = event.clientX - R.left + 14, ly = event.clientY - R.top - th - 10;
    if (lx + tw > R.width) lx = event.clientX - R.left - tw - 14;
    if (ly < 0) ly = event.clientY - R.top + 14;
    tip.style.left = `${Math.max(0, lx)}px`; tip.style.top = `${ly}px`;
  }
  const tipHide = (box) => { tipFor(box).hidden = true; };

  /* ---------- controls ---------- */
  const SELECTS = {
    comprador: { field: 'comprador_responsable', all: 'Todos los compradores' },
    commodity: { field: 'commodity', all: 'Todos los commodities' },
    division: { field: 'division_zf', all: 'Todas las divisiones' },
    pais: { field: 'pais_planta', all: 'Todos los países' },
  };
  $$('.zf-filters select').forEach((sel) => sel.addEventListener('change', () => store.setParams({ [sel.dataset.param]: sel.value || null, proveedor: null })));
  $$('.zf-chip').forEach((b) => b.addEventListener('click', () => {
    const cur = store.params().cuadrante ?? null, q = b.dataset.q || null;
    store.setParams({ cuadrante: cur === q ? null : q });
  }));
  $$('.zf-kpi[data-clasif]').forEach((b) => b.addEventListener('click', () => {
    const cur = store.params().clasif ?? null, c = b.dataset.clasif;
    store.setParams({ clasif: cur === c ? null : c });
  }));
  $$('[data-y]').forEach((b) => b.addEventListener('click', () => store.setParams({ yeje: b.dataset.y })));
  const search = $('.zf-search');
  search.addEventListener('input', () => {
    zf.q = search.value.trim().toLowerCase();
    const hit = rowsOf('proveedores').find((r) => r.nombre_proveedor === search.value.trim() || String(r.supplier_id) === search.value.trim());
    if (hit) store.setParams({ proveedor: String(hit.supplier_id) }); else draw();
  });
  $('.zf-reset').addEventListener('click', () => {
    store.resetParams(); zf.q = ''; search.value = ''; zf.note = '';
    Object.values(zf.sort).forEach((s) => { s.field = null; s.dir = 1; });
  });
  function setTab(t) {
    zf.tab = t; store.setLink(t);
    draw();
  }
  $$('.zf-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  const pick = (id) => {
    zf.note = '';
    store.setParams({ proveedor: String(id) });
    requestAnimationFrame(() => {
      const r = $('#ficha').getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.85) $('#ficha').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  for (const id of ['#tabla-reglas', '#tabla-alertas', '#tabla-rfq', '#tabla-integ', '#tabla-depp', '#tabla-pron']) {
    $(`${id} tbody`).addEventListener('click', (ev) => { const tr = ev.target.closest('tr[data-sid]'); if (tr) pick(tr.dataset.sid); });
  }
  $('#tabla-depc tbody').addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr[data-key]'); if (!tr) return;
    const c = tr.dataset.key;
    store.setParams({ commodity: store.params().commodity === c ? null : c, proveedor: null });
  });
  $$('[data-act]').forEach((b) => b.addEventListener('click', () => {
    zf.note = `Demo: «${b.dataset.act}» quedaría registrado para ${$('#f-nombre').textContent}.`;
    $('#f-note').textContent = zf.note;
  }));

  /* ---------- tables ---------- */
  function renderTable(table, cols, rows, opts) {
    const sort = opts.sort;
    const tr = document.createElement('tr');
    for (const c of cols) {
      const th = document.createElement('th');
      th.scope = 'col'; th.dataset.source = c.src; th.dataset.field = c.field;
      if (c.num) th.classList.add('num');
      th.setAttribute('aria-sort', sort.field === c.field ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none');
      const b = document.createElement('button'); b.type = 'button'; b.textContent = c.label;
      b.addEventListener('click', () => {
        if (sort.field === c.field) sort.dir = -sort.dir; else { sort.field = c.field; sort.dir = c.num ? -1 : 1; }
        draw();
      });
      th.append(b); tr.append(th);
    }
    table.tHead.replaceChildren(tr);
    const list = rows.slice();
    if (sort.field) {
      const c = cols.find((x) => x.field === sort.field);
      if (c) {
        const v = c.sortv || c.get;
        list.sort((a, b) => {
          const x = v(a), y = v(b), nx = Number(x), ny = Number(y);
          if (x === null || x === undefined) return 1;
          if (y === null || y === undefined) return -1;
          const cmp = Number.isFinite(nx) && Number.isFinite(ny) && x !== '' && y !== '' ? nx - ny : String(x).localeCompare(String(y), 'es');
          return cmp * sort.dir;
        });
      }
    }
    const body = list.map((r) => {
      const row = document.createElement('tr');
      row.dataset.key = opts.key(r);
      if (opts.sid) row.dataset.sid = opts.sid(r);
      if (opts.selected && opts.selected(r)) row.classList.add('is-sel');
      for (const c of cols) {
        const td = document.createElement('td');
        if (c.num) td.classList.add('num');
        if (c.wide) td.classList.add('wide');
        const val = c.get(r), text = c.fmt ? c.fmt(val) : show(val);
        if (c.badge) td.append(badge(c.badge[val] || '', text)); else td.textContent = text;
        row.append(td);
      }
      return row;
    });
    table.tBodies[0].replaceChildren(...body);
    if (opts.emptyEl) { opts.emptyEl.hidden = body.length > 0; opts.emptyEl.textContent = opts.empty || 'Sin proveedores en esta vista.'; }
  }

  const COL = {
    nombre: { label: 'Proveedor', src: 'proveedores', field: 'nombre_proveedor', get: (d) => d.p.nombre_proveedor },
    clasif: { label: 'Clasif.', src: 'proveedores', field: 'clasificacion_zf', get: (d) => d.p.clasificacion_zf },
    cuadrante: { label: 'Cuadrante', src: 'evaluacion', field: 'cuadrante', get: (d) => d.e.cuadrante, sortv: (d) => d.e.prioridad, badge: QCLASS },
    veredicto: { label: 'Veredicto', src: 'evaluacion', field: 'veredicto', get: (d) => d.e.veredicto, badge: VCLASS },
    accion: { label: 'Acción automática', src: 'evaluacion', field: 'accion', get: (d) => d.e.accion, wide: true },
    motivo: { label: 'Motivo (regla · KPI · valor)', src: 'evaluacion', field: 'motivo', get: (d) => d.e.motivo, wide: true },
    dueno: { label: 'Dueño', src: 'evaluacion', field: 'dueno', get: (d) => d.e.dueno },
    acceso: { label: 'Acceso prioritario', src: 'evaluacion', field: 'acceso_prioritario', get: (d) => d.e.acceso_prioritario },
    league: { label: 'ZF League', src: 'proveedores', field: 'zf_league_estado', get: (d) => d.p.zf_league_estado },
    escal: { label: 'Nivel de escalación', src: 'proveedores', field: 'escalation_level', get: (d) => d.p.escalation_level, num: true },
    gasto: { label: 'Gasto anual a migrar (M€)', src: 'proveedores', field: 'gasto_anual_meur', get: (d) => d.p.gasto_anual_meur, num: true },
    gates: { label: 'Gate fallido', src: 'evaluacion', field: 'gates_fallidos', get: (d) => d.e.gates_fallidos },
    salida: { label: 'Criterio de salida', src: 'evaluacion', field: 'criterio_salida', get: (d) => d.e.criterio_salida, wide: true },
  };
  function columnas(P) {
    let k = ['nombre', 'clasif', 'cuadrante', 'veredicto', 'accion', 'motivo', 'dueno', 'acceso'];
    const notas = [];
    if (P.clasif === 'S') { k.push('league'); notas.push('Vista S: se agrega el estado en ZF League.'); }
    if (P.clasif === 'G') { k = k.filter((c) => !['cuadrante', 'veredicto', 'acceso'].includes(c)); k.splice(2, 0, 'escal'); notas.push('Vista G: se ocultan veredicto y acceso prioritario; solo se muestran acciones de escalación.'); }
    if (P.clasif === 'U') { k = k.filter((c) => c !== 'acceso'); k.push('gasto'); notas.push('Vista U: se oculta el acceso prioritario y se muestra el gasto a migrar.'); }
    if (P.cuadrante === 'Rojo') { k = k.filter((c) => c !== 'acceso'); k.splice(k.indexOf('motivo'), 0, 'gates'); k.push('salida'); notas.push('Vista Rojo: se muestran gate fallido y criterio de salida.'); }
    return { cols: k.map((id) => COL[id]), nota: notas.join(' ') };
  }
  const RFQCOLS = [
    { label: 'Proveedor', src: 'rfq_elegibles', field: 'proveedor', get: (r) => r.proveedor },
    { label: 'Clasif.', src: 'rfq_elegibles', field: 'clasificacion', get: (r) => r.clasificacion },
    { label: 'Cuadrante', src: 'rfq_elegibles', field: 'cuadrante', get: (r) => r.cuadrante, badge: QCLASS },
    { label: 'Elegibilidad', src: 'rfq_elegibles', field: 'elegibilidad', get: (r) => r.elegibilidad, sortv: (r) => r.orden, badge: ECLASS },
    { label: 'PCF (kg CO2e/pieza)', src: 'rfq_elegibles', field: 'pcf_kgco2e_unidad', get: (r) => r.pcf_kgco2e_unidad, num: true },
    { label: 'Objetivo PCF', src: 'rfq_elegibles', field: 'pcf_objetivo', get: (r) => r.pcf_objetivo, num: true },
    { label: 'Motivo', src: 'rfq_elegibles', field: 'motivo', get: (r) => r.motivo, wide: true },
  ];
  const ALCOLS = [
    { label: 'Alerta', src: 'alertas', field: 'alerta', get: (r) => r.alerta },
    { label: 'Proveedor', src: 'alertas', field: 'proveedor', get: (r) => r.proveedor },
    { label: 'Condición disparada', src: 'alertas', field: 'condicion', get: (r) => r.condicion, wide: true },
    { label: 'Severidad', src: 'alertas', field: 'severidad', get: (r) => r.severidad, sortv: (r) => r.orden, badge: SCLASS },
    { label: 'Plazo', src: 'alertas', field: 'plazo', get: (r) => r.plazo },
    { label: 'Destinatario', src: 'alertas', field: 'destinatario', get: (r) => r.destinatario },
    { label: 'Acción', src: 'alertas', field: 'accion', get: (r) => r.accion, wide: true },
  ];
  const INTCOLS = [
    { label: 'Severidad', src: 'banderas', field: 'severidad', get: (r) => r.severidad, sortv: (r) => r.orden, badge: SCLASS },
    { label: 'Regla', src: 'banderas', field: 'regla', get: (r) => r.regla },
    { label: 'Origen', src: 'banderas', field: 'origen', get: (r) => r.origen },
    { label: 'Proveedor', src: 'banderas', field: 'proveedor', get: (r) => r.proveedor },
    { label: 'Evidencia', src: 'banderas', field: 'evidencia', get: (r) => r.evidencia, wide: true },
    { label: 'Monto (€)', src: 'banderas', field: 'monto_eur', get: (r) => r.monto_eur, fmt: (v) => (v === null || v === undefined ? '—' : F.int(v)), num: true },
    { label: 'Fecha', src: 'banderas', field: 'fecha', get: (r) => r.fecha },
    { label: 'Destinatarios', src: 'banderas', field: 'destinatarios', get: (r) => r.destinatarios, wide: true },
    { label: 'Conflicto de interés', src: 'banderas', field: 'conflicto', get: (r) => r.conflicto },
  ];
  const DEPCCOLS = [
    { label: 'Commodity', src: 'dependencia_commodity', field: 'commodity', get: (r) => r.commodity },
    { label: 'Kraljic', src: 'dependencia_commodity', field: 'kraljic', get: (r) => r.kraljic },
    { label: 'Gasto anual (M€)', src: 'dependencia_commodity', field: 'gasto_total_meur', get: (r) => r.gasto_total_meur, fmt: (v) => F.meur(v), num: true },
    { label: 'Proveedor principal', src: 'dependencia_commodity', field: 'proveedor_principal', get: (r) => r.proveedor_principal },
    { label: 'Participación', src: 'dependencia_commodity', field: 'participacion_principal', get: (r) => r.participacion_principal, fmt: F.pct, num: true },
    { label: 'HHI', src: 'dependencia_commodity', field: 'hhi', get: (r) => r.hhi, fmt: (v) => F.int(v), num: true },
    { label: 'Alternativas calificadas', src: 'dependencia_commodity', field: 'alternativas_calificadas', get: (r) => r.alternativas_calificadas, num: true },
    { label: 'Diagnóstico', src: 'dependencia_commodity', field: 'diagnostico', get: (r) => r.diagnostico, badge: DCLASS },
    { label: 'Recomendación', src: 'dependencia_commodity', field: 'recomendacion', get: (r) => r.recomendacion, wide: true },
  ];
  const DEPPCOLS = [
    { label: 'Proveedor', src: 'proveedores', field: 'nombre_proveedor', get: (d) => d.p.nombre_proveedor },
    { label: 'Clasif.', src: 'proveedores', field: 'clasificacion_zf', get: (d) => d.p.clasificacion_zf },
    { label: 'Commodity', src: 'dependencia', field: 'commodity', get: (d) => d.d.commodity },
    { label: 'Participación', src: 'dependencia', field: 'participacion', get: (d) => d.d.participacion, fmt: F.pct, num: true },
    { label: 'ZF en sus ventas', src: 'dependencia', field: 'pct_ventas_zf', get: (d) => d.d.pct_ventas_zf, fmt: F.pct, num: true },
    { label: 'Diagnóstico', src: 'dependencia', field: 'diagnostico', get: (d) => d.d.diagnostico, badge: DCLASS },
    { label: 'Dependencia inversa', src: 'dependencia', field: 'dependencia_inversa', get: (d) => d.d.dependencia_inversa },
    { label: 'Recomendación', src: 'dependencia', field: 'recomendacion', get: (d) => d.d.recomendacion, wide: true },
  ];
  const PRONCOLS = [
    { label: 'Proveedor', src: 'proveedores', field: 'nombre_proveedor', get: (d) => d.p.nombre_proveedor },
    { label: 'Clasif.', src: 'proveedores', field: 'clasificacion_zf', get: (d) => d.p.clasificacion_zf },
    { label: 'Cuadrante', src: 'evaluacion', field: 'cuadrante', get: (d) => d.e.cuadrante, sortv: (d) => d.e.prioridad, badge: QCLASS },
    { label: 'Segmento', src: 'pronostico', field: 'segmento', get: (d) => d.f.segmento, sortv: (d) => d.f.orden, badge: GCLASS },
    { label: 'Prob. 3 meses', src: 'pronostico', field: 'prob_falla_3m', get: (d) => d.f.prob_falla_3m, fmt: F.pct, num: true },
    { label: 'Consistencia', src: 'pronostico', field: 'consistencia', get: (d) => d.f.consistencia, num: true },
    { label: 'Meses de historial', src: 'pronostico', field: 'meses_historial', get: (d) => d.f.meses_historial, num: true },
    { label: 'Confianza', src: 'pronostico', field: 'confianza', get: (d) => d.f.confianza },
    { label: 'Factores', src: 'pronostico', field: 'factores', get: (d) => d.f.factores, wide: true },
    { label: 'Recomendación', src: 'pronostico', field: 'recomendacion', get: (d) => d.f.recomendacion, wide: true },
  ];
  const MODCOLS = [
    { label: 'Modelo', src: 'ml_modelo', field: 'modelo', get: (r) => r.modelo },
    { label: 'Concepto', src: 'ml_modelo', field: 'concepto', get: (r) => r.concepto },
    { label: 'Valor', src: 'ml_modelo', field: 'valor', get: (r) => r.valor, wide: true },
  ];

  /* ---------- charts ---------- */
  function drawScatter(P, pts, par, selId, rfqMode, pcfBy) {
    const box = $('#sc-plot');
    box.replaceChildren(); tipHide(box);
    if (!pts.length) { failed(box, 'Sin proveedores con estos filtros', true); return; }
    const W = Math.max(300, Math.floor(box.clientWidth || 640)), H = W < 560 ? 320 : 380;
    const m = { t: 22, r: 16, b: 48, l: 70 };
    const ko = num(par.ge_ko), gate = num(par.ppm_factor_gate);
    const useGE = P.yeje !== 'sus';
    const yv = (d) => (useGE ? num(d.p.ge2025_pct) : num(d.p.sus_score));
    const ymin = useGE ? 50 : Math.min(60, Math.floor((d3.min(pts, yv) - 3) / 5) * 5);
    const x = d3.scaleLog([0.2, 5], [m.l, W - m.r]).clamp(true);
    const y = d3.scaleLinear([ymin, useGE ? 103 : 100], [H - m.b, m.t]).clamp(true);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img').attr('aria-label', useGE ? 'Calidad (PPM contra meta) contra electricidad verde por proveedor' : 'Calidad (PPM contra meta) contra SUS Score por proveedor');
    const zone = 'color-mix(in srgb, var(--cds-chart-status-critical) 8%, transparent)';
    const top = useGE ? y(ko) : H - m.b;
    if (useGE) svg.append('rect').attr('x', m.l).attr('y', y(ko)).attr('width', W - m.r - m.l).attr('height', H - m.b - y(ko)).style('fill', zone);
    svg.append('rect').attr('x', x(gate)).attr('y', m.t).attr('width', W - m.r - x(gate)).attr('height', top - m.t).style('fill', zone);
    const yt = y.ticks(5);
    svg.append('g').selectAll('line').data(yt).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).style('stroke', 'var(--cds-chart-grid)');
    const ax = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues([0.25, 0.5, 1, 2, 4]).tickFormat((v) => `${v}×`).tickSizeOuter(0));
    const ay = svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(yt).tickFormat((v) => (useGE ? `${v} %` : `${v}`)).tickSize(0).tickPadding(8));
    styleAxis(ax); styleAxis(ay); ay.select('.domain').remove();
    cap(svg.append('text').attr('x', W - m.r).attr('y', H - 8).attr('text-anchor', 'end').text('PPM ÷ meta del commodity (escala log)'));
    cap(svg.append('text').attr('transform', `translate(14,${(m.t + H - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text(useGE ? 'Electricidad verde GE 2025' : 'SUS Score'));
    const ref = svg.append('g').style('fill', 'none');
    ref.append('line').attr('x1', x(1)).attr('x2', x(1)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--cds-chart-reference)').style('stroke-dasharray', '3 3');
    ref.append('line').attr('x1', x(gate)).attr('x2', x(gate)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--cds-chart-status-critical)').style('stroke-dasharray', '4 4').style('stroke-width', 1.25);
    if (useGE) ref.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(ko)).attr('y2', y(ko)).style('stroke', 'var(--cds-chart-status-critical)').style('stroke-dasharray', '4 4').style('stroke-width', 1.25);
    cap(svg.append('text').attr('x', x(1) - 4).attr('y', m.t - 8).attr('text-anchor', 'end').text('meta'));
    cap(svg.append('text').attr('x', x(gate) + 4).attr('y', m.t - 8).text(`gate ${gate}×`));
    if (useGE) cap(svg.append('text').attr('x', W - m.r - 4).attr('y', y(ko) + 16).attr('text-anchor', 'end').text(`KO: GE bajo ${ko} %`));
    const gasto = (d) => num(d.p.gasto_anual_meur) || 0;
    const rSize = rfqMode
      ? (d) => { const v = pcfBy.get(String(d.p.supplier_id)); return Number.isFinite(v) ? d3.scaleSqrt([0.6, 1.4], [4, 15]).clamp(true)(v) : 4; }
      : (() => { const s = d3.scaleSqrt([0, d3.max(pts, gasto) || 1], [3.5, 15]); return (d) => s(gasto(d)); })();
    const dim = (d) => (P.clasif && d.p.clasificacion_zf !== P.clasif) || (P.cuadrante && d.e.cuadrante !== P.cuadrante);
    const hash = (s) => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7);
    const order = pts.slice().sort((a, b) => (String(a.p.supplier_id) === selId) - (String(b.p.supplier_id) === selId) || dim(b) - dim(a) || rSize(b) - rSize(a));
    const sym = d3.symbol();
    svg.append('g').selectAll('path').data(order).join('path')
      .attr('class', 'pt')
      .attr('d', (d) => { const r = rSize(d); const fail = [d.e.gate_sostenibilidad, d.e.gate_calidad, d.e.gate_fundamentos].includes('Falla'); return sym.type(fail ? d3.symbolTriangle : d3.symbolCircle).size(Math.PI * r * r * (fail ? 1.25 : 1))(); })
      .attr('transform', (d) => { const v = yv(d); const j = useGE && v >= ko ? ((hash(d.p.supplier_id) % 9) - 4) * 0.7 : 0; return `translate(${x(Math.max(0.2, num(d.e.ppm_ratio)))},${y(v) + j})`; })
      .style('fill', (d) => CCOLOR[d.p.clasificacion_zf] || 'var(--cds-chart-muted)')
      .style('fill-opacity', (d) => (dim(d) ? 0.14 : 0.82))
      .style('stroke', (d) => (String(d.p.supplier_id) === selId ? 'var(--color-fg)' : 'var(--color-panel)'))
      .style('stroke-width', (d) => (String(d.p.supplier_id) === selId ? 2.25 : 1))
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => tipShow(box, event, [
        ['t0', d.p.nombre_proveedor],
        ['t1', `${d.p.clasificacion_zf} · ${d.e.cuadrante} · ${d.e.veredicto}`],
        ['', `PPM ${d.e.ppm_ratio}× meta · GE ${d.p.ge2025_pct} % · SUS ${d.p.sus_score}`],
        ['', rfqMode ? `PCF ${Number.isFinite(pcfBy.get(String(d.p.supplier_id))) ? F.pct(pcfBy.get(String(d.p.supplier_id))) : 'sin dato'} del objetivo` : `Score ${d.p.supplier_performance_rate} · gasto ${d.p.gasto_anual_meur} M€`],
      ]))
      .on('mouseleave', () => tipHide(box))
      .on('click', (event, d) => pick(d.p.supplier_id));
  }

  function drawGasto(rows, par) {
    const box = $('#ig-plot');
    box.replaceChildren(); tipHide(box);
    if (!rows.length) { failed(box, 'Sin transacciones para este proveedor', true); return; }
    const W = Math.max(300, Math.floor(box.clientWidth || 600)), H = 280, m = { t: 22, r: 12, b: 30, l: 62 };
    const tol = num(par.tolerancia_gasto);
    const x = d3.scaleBand(rows.map((r) => r.mes), [m.l, W - m.r]).padding(0.3);
    const ymax = d3.max(rows, (r) => Math.max(num(r.gasto_real_eur), num(r.gasto_justificado_eur) * (1 + tol))) * 1.12;
    const y = d3.scaleLinear([0, ymax], [H - m.b, m.t]).nice();
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Gasto real mensual contra gasto justificado por la demanda');
    const yt = y.ticks(4);
    svg.append('g').selectAll('line').data(yt).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).style('stroke', 'var(--cds-chart-grid)');
    const cx = (r) => x(r.mes) + x.bandwidth() / 2;
    svg.append('path').datum(rows).attr('d', d3.area().x(cx).y0((r) => y(num(r.gasto_justificado_eur))).y1((r) => y(num(r.gasto_justificado_eur) * (1 + tol))))
      .style('fill', 'var(--cds-chart-reference-tint)');
    svg.append('g').selectAll('rect').data(rows).join('rect').attr('class', 'pt')
      .attr('x', (r) => x(r.mes)).attr('width', x.bandwidth()).attr('y', (r) => y(num(r.gasto_real_eur))).attr('height', (r) => H - m.b - y(num(r.gasto_real_eur))).attr('rx', 3)
      .style('fill', (r) => (si(r.fuera_tolerancia) ? 'var(--cds-chart-status-critical)' : 'var(--cds-chart-categorical-1)')).style('fill-opacity', 0.85)
      .on('mouseenter', (event, r) => tipShow(box, event, [
        ['t1', `${mesCorto(r.mes)} ${r.mes.slice(0, 4)}`],
        ['t0', `Real ${F.eur(r.gasto_real_eur)}`],
        ['', `Justificado ${F.eur(r.gasto_justificado_eur)} · razón ${r.razon}×`],
        ['', r.puntaje_ml === null ? 'Sin puntaje ML' : `Puntaje de anomalía ML ${num(r.puntaje_ml).toFixed(2)}${si(r.anomalia_ml) ? ' (anómalo)' : ''}`],
      ]))
      .on('mouseleave', () => tipHide(box));
    svg.append('path').datum(rows).attr('d', d3.line(cx, (r) => y(num(r.gasto_justificado_eur)))).style('fill', 'none').style('stroke', 'var(--cds-chart-axis)').style('stroke-width', 2).style('stroke-linejoin', 'round').style('stroke-linecap', 'round');
    svg.append('g').selectAll('path').data(rows.filter((r) => si(r.anomalia_ml))).join('path')
      .attr('d', d3.symbol(d3.symbolDiamond, 60)).attr('transform', (r) => `translate(${cx(r)},${y(num(r.gasto_real_eur)) - 10})`)
      .style('fill', 'var(--cds-chart-status-warning)').style('stroke', 'var(--color-fg)').style('stroke-width', 0.75);
    const every = x.bandwidth() < 26 ? 2 : 1;
    const ax = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickFormat((d, i) => (i % every ? '' : mesCorto(d))).tickSizeOuter(0));
    const ay = svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(yt).tickFormat((v) => `${F.compact(v)} €`).tickSize(0).tickPadding(8));
    styleAxis(ax); styleAxis(ay); ay.select('.domain').remove();
  }

  function drawKraljic(rows, par, P) {
    const box = $('#kr-plot');
    box.replaceChildren(); tipHide(box);
    if (!rows.length) { failed(box, 'Sin datos de commodities', true); return; }
    const W = Math.max(300, Math.floor(box.clientWidth || 600)), H = W < 560 ? 320 : 360, m = { t: 30, r: 20, b: 46, l: 56 };
    const x = d3.scaleLinear([0, d3.max(rows, (r) => num(r.gasto_total_meur)) * 1.2], [m.l, W - m.r]);
    const y = d3.scaleLinear([0.5, 5.5], [H - m.b, m.t]);
    const med = num(rows[0].mediana_gasto_meur), ur = num(par.umbral_riesgo_kraljic) - 0.5;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Matriz de Kraljic: gasto del commodity contra riesgo de suministro');
    svg.append('g').selectAll('line').data([1, 2, 3, 4, 5]).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).style('stroke', 'var(--cds-chart-grid)');
    const ref = svg.append('g').style('stroke', 'var(--cds-chart-reference)').style('stroke-dasharray', '4 4');
    ref.append('line').attr('x1', x(med)).attr('x2', x(med)).attr('y1', m.t).attr('y2', H - m.b);
    ref.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(ur)).attr('y2', y(ur));
    const q = [['Cuello de botella', m.l + 6, m.t - 10, 'start'], ['Estratégico', W - m.r - 4, m.t - 10, 'end'], ['Rutinario', m.l + 6, H - m.b - 8, 'start'], ['Apalancamiento', W - m.r - 4, H - m.b - 8, 'end']];
    for (const [t, qx, qy, a] of q) cap(svg.append('text').attr('x', qx).attr('y', qy).attr('text-anchor', a).style('font-weight', 'var(--cds-font-weight-medium)').text(t));
    const ax = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat((v) => F.int(v)).tickSizeOuter(0));
    const ay = svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues([1, 2, 3, 4, 5]).tickSize(0).tickPadding(8));
    styleAxis(ax); styleAxis(ay); ay.select('.domain').remove();
    cap(svg.append('text').attr('x', W - m.r).attr('y', H - 8).attr('text-anchor', 'end').text('Gasto anual del commodity (M€)'));
    cap(svg.append('text').attr('transform', `translate(14,${(m.t + H - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('Riesgo de suministro (1–5)'));
    const color = (r) => (['Dependencia innecesaria', 'Dependencia sin alternativa'].includes(r.diagnostico) ? 'var(--cds-chart-status-critical)' : r.diagnostico === 'Dependencia estratégica' ? 'var(--cds-chart-status-warning)' : 'var(--cds-chart-muted)');
    const rs = d3.scaleSqrt([0, 1], [4, 20]);
    const pts = rows.map((r) => ({ r, px: x(num(r.gasto_total_meur)), py: y(num(r.riesgo_suministro)) }));
    pts.sort((a, b) => a.py - b.py || a.px - b.px);
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1], b = pts[i];
      if (Math.abs(a.py - b.py) < 2 && Math.abs(a.px - b.px) < 28) { a.py -= 10; b.py += 10; }
    }
    const g = svg.append('g');
    g.selectAll('circle').data(pts).join('circle').attr('class', 'pt')
      .attr('cx', (d) => d.px).attr('cy', (d) => d.py).attr('r', (d) => rs(num(d.r.participacion_principal)))
      .style('fill', (d) => color(d.r)).style('fill-opacity', 0.72)
      .style('stroke', (d) => (P.commodity === d.r.commodity ? 'var(--color-fg)' : 'var(--color-panel)')).style('stroke-width', (d) => (P.commodity === d.r.commodity ? 2.25 : 1))
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => tipShow(box, event, [
        ['t0', d.r.commodity], ['t1', `${d.r.kraljic} · riesgo ${d.r.riesgo_suministro} de 5`],
        ['', `Gasto ${F.meur(d.r.gasto_total_meur)} M€ · ${d.r.n_proveedores} proveedores · HHI ${F.int(d.r.hhi)}`],
        ['', `${d.r.proveedor_principal}: ${F.pct(d.r.participacion_principal)} del gasto`], ['', d.r.diagnostico],
      ]))
      .on('mouseleave', () => tipHide(box))
      .on('click', (event, d) => store.setParams({ commodity: P.commodity === d.r.commodity ? null : d.r.commodity, proveedor: null }));
    const placed = [];
    const lab = svg.append('g');
    const overlaps = (b) => placed.some((p) => !(b.x + b.width < p.x || p.x + p.width < b.x || b.y + b.height < p.y || p.y + p.height < b.y));
    for (const d of pts) {
      const rr = rs(num(d.r.participacion_principal));
      const t = cap(lab.append('text').text(`${d.r.commodity} · ${F.pct(d.r.participacion_principal)}`)).style('fill', 'var(--color-fg)');
      const tries = [[d.px + rr + 4, d.py + 4, 'start'], [d.px - rr - 4, d.py + 4, 'end'], [d.px, d.py - rr - 5, 'middle'], [d.px, d.py + rr + 13, 'middle']];
      let ok = false;
      for (const [lx, ly, an] of tries) {
        t.attr('x', lx).attr('y', ly).attr('text-anchor', an);
        const b = t.node().getBBox();
        if (b.x >= 0 && b.x + b.width <= W && !overlaps(b)) { placed.push(b); ok = true; break; }
      }
      if (!ok) { const [lx, ly, an] = tries[0]; t.attr('x', lx).attr('y', ly).attr('text-anchor', an); placed.push(t.node().getBBox()); }
    }
  }

  function drawForecast(pts, par, selId) {
    const box = $('#pm-plot');
    box.replaceChildren(); tipHide(box);
    if (!pts.length) { failed(box, 'Sin proveedores con pronóstico en esta vista', true); return; }
    const W = Math.max(300, Math.floor(box.clientWidth || 600)), H = W < 560 ? 320 : 360, m = { t: 28, r: 16, b: 46, l: 56 };
    const up = num(par.umbral_prob), uc = num(par.umbral_consistencia);
    const x = d3.scaleLinear([0, 104], [m.l, W - m.r]);
    const y = d3.scaleLinear([0, Math.max(0.7, d3.max(pts, (d) => num(d.f.prob_falla_3m)) * 1.1)], [H - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Consistencia histórica contra probabilidad de falla en 3 meses por proveedor');
    const yt = y.ticks(5);
    svg.append('g').selectAll('line').data(yt).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).style('stroke', 'var(--cds-chart-grid)');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', x(uc) - m.l).attr('height', y(up) - m.t).style('fill', 'color-mix(in srgb, var(--cds-chart-status-critical) 8%, transparent)');
    const ref = svg.append('g').style('stroke', 'var(--cds-chart-reference)').style('stroke-dasharray', '4 4');
    ref.append('line').attr('x1', x(uc)).attr('x2', x(uc)).attr('y1', m.t).attr('y2', H - m.b);
    ref.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(up)).attr('y2', y(up));
    const q = [['Deterioro estructural', m.l + 6, m.t - 10, 'start', 'var(--color-bad)'], ['Bache temporal', W - m.r - 4, m.t - 10, 'end', 'var(--color-warn)'], ['Vigilar', m.l + 6, H - m.b - 8, 'start', 'var(--color-fg-muted)'], ['Estable', W - m.r - 4, H - m.b - 8, 'end', 'var(--color-ok)']];
    for (const [t, qx, qy, a, c] of q) svg.append('text').attr('x', qx).attr('y', qy).attr('text-anchor', a).style('fill', c).style('font-size', 'var(--cds-font-size-caption)').style('font-weight', 'var(--cds-font-weight-medium)').text(t);
    const ax = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues([0, 25, 50, 75, 100]).tickSizeOuter(0));
    const ay = svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(yt).tickFormat(d3.format('.0%')).tickSize(0).tickPadding(8));
    styleAxis(ax); styleAxis(ay); ay.select('.domain').remove();
    cap(svg.append('text').attr('x', W - m.r).attr('y', H - 8).attr('text-anchor', 'end').text('Consistencia histórica (0–100)'));
    cap(svg.append('text').attr('transform', `translate(14,${(m.t + H - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('Probabilidad de falla en 3 meses'));
    const hash = (s) => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7);
    const order = pts.slice().sort((a, b) => (String(a.p.supplier_id) === selId) - (String(b.p.supplier_id) === selId));
    svg.append('g').selectAll('circle').data(order).join('circle').attr('class', 'pt')
      .attr('cx', (d) => x(num(d.f.consistencia) - (hash(d.p.supplier_id) % 5) * 0.7)).attr('cy', (d) => y(num(d.f.prob_falla_3m)))
      .attr('r', (d) => (String(d.p.supplier_id) === selId ? 7 : 5.5))
      .style('fill', (d) => CCOLOR[d.p.clasificacion_zf]).style('fill-opacity', 0.82)
      .style('stroke', (d) => (String(d.p.supplier_id) === selId ? 'var(--color-fg)' : 'var(--color-panel)')).style('stroke-width', (d) => (String(d.p.supplier_id) === selId ? 2.25 : 1))
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => tipShow(box, event, [
        ['t0', d.p.nombre_proveedor], ['t1', `${d.p.clasificacion_zf} · ${d.e.cuadrante} · ${d.f.segmento}`],
        ['', `Prob. de falla ${F.pct(d.f.prob_falla_3m)} · consistencia ${d.f.consistencia}`], ['', d.f.factores],
      ]))
      .on('mouseleave', () => tipHide(box))
      .on('click', (event, d) => pick(d.p.supplier_id));
  }

  function drawSpark(p, par, hist) {
    const sp = $('#f-spark'); sp.replaceChildren();
    const hs = hist.filter((h) => String(h.supplier_id) === String(p.supplier_id)).sort((a, b) => (a.mes < b.mes ? -1 : 1)).slice(-12);
    if (!hs.length) return;
    const W = Math.max(220, Math.floor(sp.clientWidth || 300)), H = 84, mm = { t: 8, r: 70, b: 18, l: 4 };
    const t = num(p.ppm_objetivo), gate = num(par.ppm_factor_gate);
    const x = d3.scalePoint(hs.map((h) => h.mes), [mm.l + 6, W - mm.r]);
    const y = d3.scaleLinear([0, Math.max(d3.max(hs, (h) => num(h.ppm)), gate * t) * 1.08], [H - mm.b, mm.t]);
    const s = d3.select(sp).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'PPM mensual total y atribuible al proveedor contra meta y gate');
    const lbl = (yy, txt, col) => s.append('text').attr('x', W - mm.r + 6).attr('y', yy + 4).style('fill', col).style('font-size', 'var(--cds-font-size-caption)').text(txt);
    s.append('line').attr('x1', mm.l).attr('x2', W - mm.r).attr('y1', y(t)).attr('y2', y(t)).style('stroke', 'var(--cds-chart-reference)').style('stroke-dasharray', '3 3');
    s.append('line').attr('x1', mm.l).attr('x2', W - mm.r).attr('y1', y(gate * t)).attr('y2', y(gate * t)).style('stroke', 'var(--cds-chart-status-critical)').style('stroke-dasharray', '4 4');
    const ly1 = y(t), ly2 = y(gate * t);
    lbl(ly2, `gate ${F.int(gate * t)}`, 'var(--color-bad)');
    lbl(Math.max(ly1, ly2 + 13), `meta ${F.int(t)}`, 'var(--color-fg-muted)');
    const c = CCOLOR[p.clasificacion_zf];
    s.append('path').datum(hs).attr('d', d3.line((h) => x(h.mes), (h) => y(num(h.ppm) - num(h.ppm_causa_zf || 0)))).style('fill', 'none').style('stroke', c).style('stroke-width', 1.5).style('stroke-dasharray', '2 3').style('stroke-linecap', 'round');
    s.append('path').datum(hs).attr('d', d3.line((h) => x(h.mes), (h) => y(num(h.ppm)))).style('fill', 'none').style('stroke', c).style('stroke-width', 2).style('stroke-linecap', 'round').style('stroke-linejoin', 'round');
    s.append('g').selectAll('circle').data(hs).join('circle').attr('cx', (h) => x(h.mes)).attr('cy', (h) => y(num(h.ppm))).attr('r', (h, i) => (i === hs.length - 1 ? 3.5 : 2)).style('fill', c);
    s.append('text').attr('x', x(hs[0].mes)).attr('y', H - 4).style('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)').text(`${mesCorto(hs[0].mes)} ${hs[0].mes.slice(2, 4)}`);
    s.append('text').attr('x', x(hs.at(-1).mes)).attr('y', H - 4).attr('text-anchor', 'end').style('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)').text(`${mesCorto(hs.at(-1).mes)} · ${F.int(num(hs.at(-1).ppm))} PPM`);
  }

  /* ---------- ficha ---------- */
  function drawFicha(sel, P, par, ctx, selectedByUser) {
    const box = $('#ficha');
    unskel($('#f-nombre'));
    if (!sel) {
      $('#f-hint').textContent = 'Sin proveedores en esta vista.';
      ['#f-nombre', '#f-veredicto', '#f-cuadrante', '#f-motivo', '#f-accion', '#f-dueno'].forEach((s) => { $(s, box).textContent = ''; });
      $('#f-spark').replaceChildren(); $('#f-alertas').replaceChildren(); $('#f-integ').replaceChildren();
      return;
    }
    const { p, e } = sel, w = `supplier_id=${enc(p.supplier_id)}`;
    $('#f-hint').textContent = selectedByUser ? 'Proveedor seleccionado.' : 'Mostrando el caso más relevante de la vista; busca o haz clic en otro.';
    cite($('#f-nombre'), 'proveedores', 'nombre_proveedor', w, p.nombre_proveedor);
    cite($('#f-id'), 'proveedores', 'supplier_id', w, p.supplier_id);
    cite($('#f-clasif'), 'proveedores', 'clasificacion_zf', w, p.clasificacion_zf);
    cite($('#f-commodity'), 'proveedores', 'commodity', w, p.commodity);
    cite($('#f-pais'), 'proveedores', 'pais_planta', w, p.pais_planta);
    cite($('#f-comprador'), 'proveedores', 'comprador_responsable', w, p.comprador_responsable);
    cite($('#f-veredicto'), 'evaluacion', 'veredicto', w, e.veredicto);
    cite($('#f-cuadrante'), 'evaluacion', 'cuadrante', w, e.cuadrante);
    cite($('#f-motivo'), 'evaluacion', 'motivo', w, e.motivo);
    cite($('#f-accion'), 'evaluacion', 'accion', w, e.accion);
    cite($('#f-dueno'), 'evaluacion', 'dueno', w, e.dueno);
    $('#f-banner').className = 'zf-verdict ' + ({ 'No apto': 'v-red', 'Apto condicionado': 'v-yel', 'Apto': 'v-grn' }[e.veredicto] || '');
    cite($('#f-ratio'), 'evaluacion', 'ppm_ratio', w, e.ppm_ratio);
    cite($('#f-vda'), 'proveedores', 'vda63_resultado', w, p.vda63_resultado);
    cite($('#f-dpmi'), 'proveedores', 'dpmi_score', w, p.dpmi_score);
    cite($('#f-entrega'), 'proveedores', 'delivery_performance_pct', w, p.delivery_performance_pct);
    cite($('#f-ge'), 'proveedores', 'ge2025_pct', w, p.ge2025_pct);
    cite($('#f-nqc'), 'proveedores', 'nqc_saq_score', w, p.nqc_saq_score);
    cite($('#f-pcf'), 'proveedores', 'pcf_kgco2e_unidad', w, p.pcf_kgco2e_unidad);
    cite($('#f-pcfobj'), 'proveedores', 'pcf_objetivo', w, p.pcf_objetivo);
    cite($('#f-procs'), 'evaluacion', 'procesos_activos', w, e.procesos_activos);
    cite($('#f-iatf'), 'proveedores', 'iatf16949_vencimiento', w, p.iatf16949_vencimiento);
    const faltan = [!si(p.proc_asn) && 'ASN', !si(p.proc_einvoicing) && 'eInvoicing'].filter(Boolean);
    $('#f-faltan').textContent = faltan.length ? `· falta ${faltan.join(' y ')}` : '';
    const corte = Date.parse(par.fecha_corte), iatf = Date.parse(p.iatf16949_vencimiento);
    const set = (id, s) => { $(id).className = 'dot ' + s; };
    set('#d-cal', e.gate_calidad === 'Falla' ? 'bad' : num(e.ppm_ratio) > 1 ? 'warn' : 'ok');
    set('#d-log', num(p.delivery_performance_pct) < 95 || p.gmmog_resultado === 'C' ? 'warn' : 'ok');
    set('#d-sus', e.gate_sostenibilidad === 'Falla' ? 'bad' : e.gate_pcf === 'Falla' ? 'warn' : 'ok');
    set('#d-dig', num(e.procesos_activos) < 8 ? 'warn' : 'ok');
    set('#d-fun', e.gate_fundamentos === 'Falla' ? 'bad' : iatf <= corte + num(par.iatf_aviso_dias) * 864e5 ? 'warn' : 'ok');
    drawSpark(p, par, ctx.hist);

    // forecast
    const f = ctx.pron.get(String(p.supplier_id));
    if (f) {
      const sg = $('#f-seg'); sg.className = 'zf-b ' + (GCLASS[f.segmento] || ''); cite(sg, 'pronostico', 'segmento', w, f.segmento);
      cite($('#f-prob'), 'pronostico', 'prob_falla_3m', w, f.prob_falla_3m === null ? 'Sin pronóstico' : F.pct(f.prob_falla_3m));
      cite($('#f-cons'), 'pronostico', 'consistencia', w, f.consistencia);
      cite($('#f-meses'), 'pronostico', 'meses_historial', w, f.meses_historial);
      cite($('#f-confi'), 'pronostico', 'confianza', w, String(f.confianza).toLowerCase());
      cite($('#f-zf'), 'pronostico', 'pct_ppm_causa_zf_12m', w, f.pct_ppm_causa_zf_12m);
      cite($('#f-fact'), 'pronostico', 'factores', w, f.factores);
      cite($('#f-rec'), 'pronostico', 'recomendacion', w, f.recomendacion);
    }
    // integrity
    const al = ctx.banderas.filter((b) => String(b.supplier_id) === String(p.supplier_id)).sort((a, b) => a.orden - b.orden);
    $('#f-integ-n').textContent = al.length ? `${al.length} ${al.length === 1 ? 'alerta' : 'alertas'}` : '';
    const items = al.slice(0, 3).map((b) => {
      const li = document.createElement('li'), ln = document.createElement('span'), to = document.createElement('span'), rg = document.createElement('span');
      ln.className = 'ln'; to.className = 'to';
      ln.append(badge(SCLASS[b.severidad], b.severidad), rg);
      cite(rg, 'banderas', 'regla', `alerta_id=${enc(b.alerta_id)}`, `${b.regla}${b.monto_eur !== null && b.monto_eur !== undefined ? ` · ${F.eur(b.monto_eur)}` : ''}`);
      cite(to, 'banderas', 'destinatarios', `alerta_id=${enc(b.alerta_id)}`, `Para: ${b.destinatarios}`);
      li.append(ln, to); return li;
    });
    if (!items.length) { const li = document.createElement('li'); li.className = 'to'; li.textContent = 'Sin alertas de integridad en la ventana de abril a septiembre.'; items.push(li); }
    if (al.length > 3) { const li = document.createElement('li'); li.className = 'to'; li.textContent = `y ${al.length - 3} más en la pestaña Integridad de compras.`; items.push(li); }
    $('#f-integ').replaceChildren(...items);
    // dependency
    const d = ctx.dep.get(String(p.supplier_id));
    if (d) {
      cite($('#f-part'), 'dependencia', 'participacion', w, F.pct(d.participacion));
      cite($('#f-kraljic'), 'dependencia', 'kraljic', w, d.kraljic);
      cite($('#f-inv'), 'dependencia', 'pct_ventas_zf', w, d.pct_ventas_zf === null ? '—' : `${F.pct(d.pct_ventas_zf)}${d.dependencia_inversa === 'Sí' ? ' (alto)' : ''}`);
      cite($('#f-diag'), 'dependencia', 'diagnostico', w, d.diagnostico);
      cite($('#f-drec'), 'dependencia', 'recomendacion', w, d.recomendacion);
    }
    // A1–A3
    const a = ctx.alertas.filter((x) => String(x.supplier_id) === String(p.supplier_id));
    $('#f-alertas').replaceChildren(...a.map((x) => { const b = badge(SCLASS[x.severidad], x.alerta); cite(b, 'alertas', 'alerta', `alerta_key=${enc(x.alerta_key)}`, x.alerta); return b; }));
    // buttons
    const dd = d || {};
    const can = {
      'Liberar RFQ': e.veredicto !== 'No apto',
      'Invitar a ZF League': e.cuadrante === 'Amarillo' || (f && f.segmento === 'Bache temporal' && e.cuadrante !== 'Bloqueado'),
      'Solicitar plan de acción': e.cuadrante === 'Rojo' || (f && f.segmento === 'Bache temporal'),
      'Abrir escalación': e.cuadrante === 'Rojo' || e.cuadrante === 'Bloqueado',
      'Enviar a Compliance': al.length > 0,
      'Iniciar doble fuente': ['Dependencia innecesaria', 'Dependencia sin alternativa', 'Dependencia estratégica'].includes(dd.diagnostico) || (f && f.segmento === 'Deterioro estructural'),
    };
    const primary = al.some((b) => b.severidad === 'Alta') ? 'Enviar a Compliance'
      : e.cuadrante === 'Verde' || e.cuadrante === 'Azul' ? 'Liberar RFQ' : e.cuadrante === 'Amarillo' ? 'Invitar a ZF League'
        : e.cuadrante === 'Rojo' ? 'Solicitar plan de acción' : e.cuadrante === 'Bloqueado' ? 'Abrir escalación' : '';
    $$('[data-act]').forEach((b) => { b.disabled = !can[b.dataset.act]; b.classList.toggle('is-primary', b.dataset.act === primary); });
    $('#f-note').textContent = zf.note;
  }

  /* ---------- main draw ---------- */
  function fillParams(par) {
    for (const el of $$('[data-source="parametros"][data-row="0"]')) {
      const k = el.dataset.field, v = par ? par[k] : null;
      el.textContent = v === null || v === undefined ? '—' : PCT_PARAMS.has(k) ? F.pct(v) : typeof v === 'number' && v >= 1000 ? F.int(v) : String(v);
    }
  }
  function tile(el, field, where, value) { cite(el, 'conteos', field, where, value ?? 0); unskel(el); }

  function draw() {
    const P = store.params();
    const prov = rowsOf('proveedores'), ev = rowsOf('evaluacion'), par = rowsOf('parametros')[0];
    fillParams(par);
    $$('.zf-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === zf.tab)));
    TABS.forEach((t) => { $(`#${t}`).hidden = t !== zf.tab; });

    for (const [name, cfg] of Object.entries(SELECTS)) {
      const sel = $(`select[data-param="${name}"]`);
      const vals = [...new Set(prov.map((r) => r[cfg.field]))].filter((v) => v !== null && v !== undefined).sort((a, b) => String(a).localeCompare(String(b), 'es'));
      sel.replaceChildren(new Option(cfg.all, ''), ...vals.map((v) => new Option(v, v)));
      sel.value = P[name] ?? '';
    }
    const rfqs = rowsOf('rfqs');
    const rsel = $('select[data-param="rfq"]');
    rsel.replaceChildren(new Option('Sin RFQ (vista de cartera)', ''), ...rfqs.map((q) => new Option(`${q.rfq_id} · ${q.titulo}`, q.rfq_id)));
    rsel.value = P.rfq ?? '';
    rsel.title = zf.tab === 'desempeno' ? '' : 'El modo RFQ aplica a la pestaña Desempeño';
    $$('.zf-chip').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.q || null) === (P.cuadrante ?? null))));
    $$('[data-y]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.y === (P.yeje || 'ge'))));
    $('#zf-names').replaceChildren(...prov.map((r) => new Option(r.nombre_proveedor)));

    if (!(statusOf('proveedores') === 'ok' && statusOf('evaluacion') === 'ok' && par)) {
      const bad = ['proveedores', 'evaluacion', 'parametros'].some((id) => ['error', 'missing'].includes(statusOf(id)));
      if (bad) { failed($('#sc-plot')); unskel($('#sc-plot')); }
      return;
    }

    const evBy = new Map(ev.map((e) => [String(e.supplier_id), e]));
    const all = prov.map((p) => ({ p, e: evBy.get(String(p.supplier_id)) })).filter((d) => d.e);
    const inDims = (d) => (!P.comprador || d.p.comprador_responsable === P.comprador) && (!P.commodity || d.p.commodity === P.commodity) && (!P.division || d.p.division_zf === P.division) && (!P.pais || d.p.pais_planta === P.pais);
    const base = all.filter(inDims);
    const inView = (d) => (!P.clasif || d.p.clasificacion_zf === P.clasif) && (!P.cuadrante || d.e.cuadrante === P.cuadrante);
    const matchQ = (name, id) => !zf.q || String(name).toLowerCase().includes(zf.q) || String(id).toLowerCase().includes(zf.q);
    const view = base.filter(inView);
    const viewIds = new Set(view.map((d) => String(d.p.supplier_id)));
    const byId = new Map(all.map((d) => [String(d.p.supplier_id), d]));
    const defaultOrder = (a, b) => a.e.prioridad - b.e.prioridad || num(b.p.gasto_anual_meur) - num(a.p.gasto_anual_meur);
    const tableRows = view.filter((d) => matchQ(d.p.nombre_proveedor, d.p.supplier_id)).sort(defaultOrder);
    const ctx = {
      hist: rowsOf('historial'), alertas: rowsOf('alertas'), banderas: rowsOf('banderas'),
      pron: new Map(rowsOf('pronostico').map((f) => [String(f.supplier_id), f])),
      dep: new Map(rowsOf('dependencia').map((d) => [String(d.supplier_id), d])),
    };

    // header, cards and tab counters (conteos)
    const clas = P.clasif ?? 'Todas';
    const dimW = `comprador=${enc(P.comprador ?? 'Todos')}&commodity=${enc(P.commodity ?? 'Todos')}&division=${enc(P.division ?? 'Todos')}&pais=${enc(P.pais ?? 'Todos')}`;
    const cBy = new Map(rowsOf('conteos').map((r) => [[r.comprador, r.commodity, r.division, r.pais, r.clasificacion].join('|'), r]));
    const ck = (c) => cBy.get([P.comprador ?? 'Todos', P.commodity ?? 'Todos', P.division ?? 'Todos', P.pais ?? 'Todos', c].join('|')) || {};
    if (statusOf('conteos') === 'ok') {
      const tot = ck('Todas'), s = ck('S'), cv = ck(clas), wT = `${dimW}&clasificacion=Todas`, wC = `${dimW}&clasificacion=${enc(clas)}`;
      $('#tw-scope').textContent = P.comprador || P.commodity || P.division || P.pais ? 'En esta vista' : 'En la cartera';
      cite($('#tw-n'), 'conteos', 'proveedores', wT, tot.proveedores ?? 0);
      cite($('#tw-rojo'), 'conteos', 'en_rojo', wT, tot.en_rojo ?? 0);
      cite($('#tw-rojo-s'), 'conteos', 'en_rojo', `${dimW}&clasificacion=S`, s.en_rojo ?? 0);
      cite($('#tw-aptos'), 'conteos', 'aptos', wT, tot.aptos ?? 0);
      cite($('#tw-integ'), 'conteos', 'alertas_integridad', wT, tot.alertas_integridad ?? 0);
      unskel($('#takeaway'));
      $$('.zf-kpi[data-clasif]').forEach((card) => {
        const c = card.dataset.clasif, r = ck(c);
        const [v, rojo] = card.querySelectorAll('[data-source="conteos"]');
        tile(v, 'proveedores', `${dimW}&clasificacion=${c}`, r.proveedores);
        if (rojo) { cite(rojo, 'conteos', 'en_rojo', `${dimW}&clasificacion=${c}`, r.en_rojo ?? 0); rojo.parentElement.classList.toggle('is-bad', (r.en_rojo ?? 0) > 0); }
        card.setAttribute('aria-pressed', String(P.clasif === c));
      });
      $('#tarjetas').classList.toggle('has-pick', Boolean(P.clasif));
      tile($('#sus-v'), 'sus_promedio', wT, tot.sus_promedio);
      cite($('#sus-ge'), 'conteos', 'pct_ge100', wT, tot.pct_ge100);
      cite($('#sc-riesgo'), 'conteos', 'zona_riesgo', `${dimW}&clasificacion=S`, s.zona_riesgo ?? 0);
      for (const [id, field] of [['#tabn-integ', 'alertas_integridad'], ['#tabn-dep', 'dep_innecesaria'], ['#tabn-pron', 'seg_deterioro']]) {
        cite($(id), 'conteos', field, wC, cv[field] ?? 0); $(id).classList.toggle('is-zero', !(cv[field] > 0));
      }
      for (const el of $$(`#${zf.tab} .zf-tile [data-source="conteos"]`)) tile(el, el.dataset.field, wC, cv[el.dataset.field]);
      $('#ti-alertas').classList.toggle('is-bad', (cv.alertas_integridad ?? 0) > 0);
      $('#td-innec').classList.toggle('is-bad', (cv.dep_innecesaria ?? 0) > 0);
      $('#tp-det').classList.toggle('is-bad', (cv.seg_deterioro ?? 0) > 0);
    } else if (statusOf('conteos') === 'error') failed($('#takeaway'));

    // per-tab rows (needed before choosing the ficha)
    const rfq = zf.tab === 'desempeno' && P.rfq ? rfqs.find((q) => q.rfq_id === P.rfq) : null;
    const elig = rowsOf('rfq_elegibles').filter((f) => rfq && f.rfq_id === rfq.rfq_id);
    const integRows = ctx.banderas.filter((b) => viewIds.has(String(b.supplier_id)) && matchQ(b.proveedor, b.supplier_id))
      .sort((a, b) => a.orden - b.orden || (num(b.monto_eur) || 0) - (num(a.monto_eur) || 0));
    const depcRows = rowsOf('dependencia_commodity').filter((c) => !P.commodity || c.commodity === P.commodity);
    const DORD = { 'Dependencia innecesaria': 1, 'Dependencia sin alternativa': 2, 'Dependencia estratégica': 3, 'Sin dependencia relevante': 4 };
    const deppRows = view.map((d) => ({ ...d, d: ctx.dep.get(String(d.p.supplier_id)) })).filter((d) => d.d && d.d.con_alerta && matchQ(d.p.nombre_proveedor, d.p.supplier_id))
      .sort((a, b) => DORD[a.d.diagnostico] - DORD[b.d.diagnostico] || num(b.d.pct_ventas_zf) - num(a.d.pct_ventas_zf));
    const pronRows = view.map((d) => ({ ...d, f: ctx.pron.get(String(d.p.supplier_id)) })).filter((d) => d.f && matchQ(d.p.nombre_proveedor, d.p.supplier_id))
      .sort((a, b) => a.f.orden - b.f.orden || num(b.f.prob_falla_3m) - num(a.f.prob_falla_3m));

    // selection
    let sel = P.proveedor ? byId.get(String(P.proveedor)) : null;
    const byUser = Boolean(sel);
    if (!sel) {
      if (zf.tab === 'integridad' && integRows.length) sel = byId.get(String(integRows[0].supplier_id));
      else if (zf.tab === 'dependencia' && deppRows.length) sel = deppRows[0];
      else if (zf.tab === 'pronostico' && pronRows.length) sel = pronRows[0];
      else if (rfq) { const f0 = elig.slice().sort((a, b) => a.orden - b.orden)[0]; sel = f0 ? byId.get(String(f0.supplier_id)) : null; }
      if (!sel) sel = tableRows[0] || view.slice().sort(defaultOrder)[0] || base.slice().sort(defaultOrder)[0] || null;
    }
    const selId = sel ? String(sel.p.supplier_id) : '';
    const isSel = (id) => String(id) === selId;

    if (zf.tab === 'desempeno') {
      const pcfBy = new Map(elig.map((f) => [String(f.supplier_id), f.pcf_kgco2e_unidad === null ? NaN : num(f.pcf_kgco2e_unidad) / num(f.pcf_objetivo)]));
      const scPts = rfq ? all.filter((d) => d.p.commodity === rfq.commodity) : base;
      unskel($('#sc-plot'));
      $('#sc-sub').textContent = rfq ? `Modo RFQ: proveedores de ${rfq.commodity}. Tamaño = PCF contra su objetivo; zona sombreada = falla un gate.` : 'Cada punto es un proveedor. Zona sombreada = falla un gate. Clic para abrir su ficha.';
      $('#sc-size').textContent = rfq ? 'tamaño = PCF vs. objetivo' : 'tamaño = gasto anual';
      drawScatter(P, scPts, par, selId, Boolean(rfq), pcfBy);
      $('#rfq-bar').hidden = !rfq; $('#wrap-rfq').hidden = !rfq; $('#wrap-main').hidden = Boolean(rfq);
      if (rfq) {
        $('#acc-title').textContent = 'Elegibilidad para la RFQ';
        $('#acc-ctx').textContent = 'Excluye G, U y Rojo; un PCF sobre objetivo deja fuera al proveedor de esta RFQ sin cambiar su cuadrante.';
        const qw = `rfq_id=${enc(rfq.rfq_id)}`;
        cite($('#rfq-id'), 'rfqs', 'rfq_id', qw, rfq.rfq_id); cite($('#rfq-titulo'), 'rfqs', 'titulo', qw, rfq.titulo);
        cite($('#rfq-comm'), 'rfqs', 'commodity', qw, rfq.commodity); cite($('#rfq-cierre'), 'rfqs', 'cierre', qw, rfq.cierre);
        const rs = rowsOf('rfq_resumen').find((r) => r.rfq_id === rfq.rfq_id) || {};
        cite($('#rfq-eleg'), 'rfq_resumen', 'elegibles', qw, rs.elegibles ?? 0); cite($('#rfq-prio'), 'rfq_resumen', 'prioritarios', qw, rs.prioritarios ?? 0); cite($('#rfq-excl'), 'rfq_resumen', 'fuera', qw, rs.fuera ?? 0);
        const blocked = P.clasif === 'G' || P.clasif === 'U';
        const rows = blocked ? [] : elig.filter((f) => (!P.clasif || f.clasificacion === P.clasif) && (!P.cuadrante || f.cuadrante === P.cuadrante) && matchQ(f.proveedor, f.supplier_id))
          .sort((a, b) => a.orden - b.orden || (num(a.pcf_kgco2e_unidad) / num(a.pcf_objetivo)) - (num(b.pcf_kgco2e_unidad) / num(b.pcf_objetivo)));
        renderTable($('#tabla-rfq'), RFQCOLS, rows, { sort: zf.sort.rfq, key: (r) => `${encodeURIComponent(r.rfq_id)},${encodeURIComponent(r.supplier_id)}`, sid: (r) => r.supplier_id, selected: (r) => isSel(r.supplier_id), empty: blocked ? `Los proveedores ${P.clasif} no participan en RFQs.` : 'Sin proveedores del commodity con estos filtros.', emptyEl: $('#rfq-empty') });
        $('#main-empty').hidden = true; $('#acc-ctx').hidden = false;
      } else {
        $('#acc-title').textContent = 'Acciones automáticas';
        const { cols, nota } = columnas(P);
        $('#acc-ctx').textContent = nota; $('#acc-ctx').hidden = !nota;
        renderTable($('#tabla-reglas'), cols, tableRows, { sort: zf.sort.main, key: (d) => d.p.supplier_id, sid: (d) => d.p.supplier_id, selected: (d) => isSel(d.p.supplier_id), emptyEl: $('#main-empty') });
        $('#rfq-empty').hidden = true;
      }
      const scIds = new Set((rfq ? scPts : view).map((d) => String(d.p.supplier_id)));
      const al = ctx.alertas.filter((a) => scIds.has(String(a.supplier_id)) && matchQ(a.proveedor, a.supplier_id)).sort((a, b) => a.orden - b.orden || String(a.proveedor).localeCompare(String(b.proveedor), 'es'));
      renderTable($('#tabla-alertas'), ALCOLS, al, { sort: zf.sort.alertas, key: (r) => r.alerta_key, sid: (r) => r.supplier_id, selected: (r) => isSel(r.supplier_id), empty: 'Sin alertas activas en esta vista.', emptyEl: $('#al-empty') });
    }

    if (zf.tab === 'integridad') {
      cite($('#ig-nombre'), 'proveedores', 'nombre_proveedor', sel ? `supplier_id=${enc(sel.p.supplier_id)}` : '', sel ? sel.p.nombre_proveedor : '—');
      const gm = rowsOf('gasto_mensual').filter((g) => sel && String(g.supplier_id) === selId).sort((a, b) => (a.mes < b.mes ? -1 : 1));
      unskel($('#ig-plot'));
      if (statusOf('gasto_mensual') === 'error') failed($('#ig-plot')); else drawGasto(gm, par);
      renderTable($('#tabla-integ'), INTCOLS, integRows, { sort: zf.sort.integ, key: (r) => r.alerta_id, sid: (r) => r.supplier_id, selected: (r) => isSel(r.supplier_id), empty: 'Sin alertas de integridad en esta vista.', emptyEl: $('#integ-empty') });
    }

    if (zf.tab === 'dependencia') {
      unskel($('#kr-plot'));
      if (statusOf('dependencia_commodity') === 'error') failed($('#kr-plot')); else drawKraljic(rowsOf('dependencia_commodity'), par, P);
      renderTable($('#tabla-depc'), DEPCCOLS, depcRows, { sort: zf.sort.depc, key: (r) => r.commodity, selected: (r) => P.commodity === r.commodity });
      renderTable($('#tabla-depp'), DEPPCOLS, deppRows, { sort: zf.sort.depp, key: (d) => d.p.supplier_id, sid: (d) => d.p.supplier_id, selected: (d) => isSel(d.p.supplier_id), empty: 'Ningún proveedor de esta vista tiene riesgo de dependencia.', emptyEl: $('#depp-empty') });
    }

    if (zf.tab === 'pronostico') {
      const pts = pronRows.filter((d) => d.f.prob_falla_3m !== null && d.f.prob_falla_3m !== undefined);
      const sin = pronRows.length - pts.length;
      $('#pm-ctx').textContent = sin ? `${sin} ${sin === 1 ? 'proveedor no aparece' : 'proveedores no aparecen'} en la gráfica por tener menos de ${par.min_meses_historial} meses de historial.` : '';
      unskel($('#pm-plot'));
      if (statusOf('pronostico') === 'error') failed($('#pm-plot')); else drawForecast(pts, par, selId);
      renderTable($('#tabla-pron'), PRONCOLS, pronRows, { sort: zf.sort.pron, key: (d) => d.p.supplier_id, sid: (d) => d.p.supplier_id, selected: (d) => isSel(d.p.supplier_id), emptyEl: $('#pron-empty') });
      renderTable($('#tabla-modelo'), MODCOLS, rowsOf('ml_modelo'), { sort: zf.sort.modelo, key: (r) => r.clave });
    }

    const plotId = { desempeno: '#sc-plot', integridad: '#ig-plot', dependencia: '#kr-plot', pronostico: '#pm-plot' }[zf.tab];
    if (zf.first && $(`${plotId} svg`)) { $(plotId).classList.add('is-first'); zf.first = false; } else $$('.zf-plot').forEach((p) => p.classList.remove('is-first'));

    drawFicha(sel, P, par, ctx, byUser);
  }
  store.onData(draw);
  if (zf.tab !== 'desempeno') store.setLink(zf.tab);
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (TABS.includes(h) && h !== zf.tab) { zf.tab = h; draw(); }
  });
}
