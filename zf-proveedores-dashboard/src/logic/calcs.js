/**
 * Reglas de negocio del dashboard (gates CATL, cuadrantes, alertas, integridad, dependencia, pronóstico).
 * Funciones puras: reciben los datasets crudos y devuelven tablas derivadas. No tocan la página.
 * Cada cálculo declara sus entradas (datasets u otros cálculos); runCalcs los ejecuta en orden.
 */
const CALCS = {};
function defineCalc(id, def) {
  CALCS[id] = def;
}

defineCalc('evaluacion', {
  inputs: ['proveedores', 'historial', 'parametros'],
  title: 'Evaluación por proveedor',
  description: 'Banda de score, gates CATL, cuadrante, veredicto, acción, dueño y alertas de cada proveedor, con las reglas del documento de diseño.',
  fn: (proveedores, historial, parametros) => {
    const p = parametros[0], n = (v) => Number(v), si = (v) => v === true || v === 'true';
    const corte = Date.parse(p.fecha_corte), aviso = corte + n(p.iatf_aviso_dias) * 864e5;
    const gate = n(p.ppm_factor_gate), pre = n(p.ppm_factor_pre);
    const serie = {};
    for (const h of historial) (serie[h.supplier_id] ??= []).push(h);
    const procesos = ['proma', 'proso', 'bd', 'sourcing', 'perma', 'delivery_schedules', 'document_mgmt', 'asn', 'einvoicing', 'credit_notes'];
    const orden = ['Bloqueado', 'Rojo', 'Amarillo', 'Gris – Salida', 'Gris – Mantener', 'Azul', 'Verde'];
    return proveedores.map((r) => {
      const c = r.clasificacion_zf, t = n(r.ppm_objetivo), spr = n(r.supplier_performance_rate);
      const ppm = (serie[r.supplier_id] || []).slice().sort((a, b) => (a.mes < b.mes ? -1 : 1)).map((h) => n(h.ppm));
      const [antes, ahora] = ppm.slice(-2);
      const ratio = Math.round((n(r.ppm_operacional) / t) * 100) / 100;
      const banda = spr >= n(p.banda_alto) ? 'Alto' : spr >= n(p.banda_medio) ? 'Medio' : 'Bajo';
      const ge = n(r.ge2025_pct), nqc = n(r.nqc_saq_score), iatf = Date.parse(r.iatf16949_vencimiento);
      const sost = [ge < n(p.ge_ko) && `GE 2025 = ${ge} % vs. ${n(p.ge_ko)} %`, !si(r.bpcoc_aceptado) && 'BPCoC no aceptado', nqc < n(p.nqc_min) && `NQC = ${nqc} %`].filter(Boolean);
      const cal = [antes > gate * t && ahora > gate * t && `PPM = ${ratio}× meta, 2 meses`, r.vda63_clase === 'C' && `VDA 6.3 = ${r.vda63_resultado} % (C)`].filter(Boolean);
      const fund = iatf < corte ? ['IATF 16949 vencido'] : [];
      const gatePcf = !si(r.pcf_reportado) || n(r.pcf_kgco2e_unidad) > n(r.pcf_objetivo);
      const falla = sost.length + cal.length + fund.length > 0;
      const activos = procesos.filter((k) => si(r['proc_' + k])).length;
      const faltan = [!si(r.proc_asn) && 'ASN', !si(r.proc_einvoicing) && 'eInvoicing'].filter(Boolean);
      const cuadrante = c === 'G' ? 'Bloqueado' : falla ? 'Rojo' : c === 'S' && banda === 'Alto' ? 'Verde'
        : (c === 'S' || c === 'A') && banda !== 'Alto' ? 'Amarillo' : c === 'A' ? 'Azul' : c === 'Z' ? 'Gris – Mantener' : 'Gris – Salida';
      const veredicto = c === 'G' || c === 'U' || falla ? 'No apto' : banda !== 'Alto' || c === 'Z' || gatePcf ? 'Apto condicionado' : 'Apto';
      const gates = [sost.length && 'Sostenibilidad', cal.length && 'Calidad', fund.length && 'Fundamentos'].filter(Boolean);
      const regla = {
        'Bloqueado': ['Solo escalación; sin negocio nuevo ni RFQs', 'Comprador + SQE', `Clasificación G · escalación nivel ${r.escalation_level}`],
        'Rojo': ['New Business Hold hasta cerrar la brecha; plan de acción correctiva', 'Comprador', `Gate ${gates.join(' + ')} · ${[...sost, ...cal, ...fund].join(' · ')}`],
        'Verde': [gatePcf ? 'Acceso prioritario suspendido en RFQs con PCF sobre objetivo' : 'Acceso prioritario a RFQs de e-mobility y chasis', 'Category Manager', `Banda Alto (${spr}) · gates OK${gatePcf ? ' · PCF sobre objetivo' : ''}`],
        'Amarillo': [`Invitación a ZF League + auditoría VDA 6.3 en ≤ 90 días${faltan.length ? `; activar ${faltan.join(' y ')}` : ''}`, 'SQE + Supplier Development', `Banda ${banda} (${spr}) · ${activos} de 10 procesos digitales`],
        'Azul': ['Revisión de ascenso a S en el siguiente comité', 'Category Manager', `Banda Alto (${spr}) · gates OK`],
        'Gris – Mantener': ['Negocio solo en partes vigentes; plan de segunda fuente', 'Category Manager', 'Clasificación Z · absolutamente necesario'],
        'Gris – Salida': ['Sin negocio nuevo; phase-out conforme a contrato', 'Comprador', 'Clasificación U · no deseado'],
      }[cuadrante];
      const enRango = (v) => v >= pre * t && v <= gate * t;
      const alza = enRango(antes) && enRango(ahora) && ahora > antes;
      return {
        supplier_id: r.supplier_id, banda, ppm_ratio: ratio,
        gate_sostenibilidad: sost.length ? 'Falla' : 'Pasa', gate_calidad: cal.length ? 'Falla' : 'Pasa',
        gate_fundamentos: fund.length ? 'Falla' : 'Pasa', gate_pcf: gatePcf ? 'Falla' : 'Pasa',
        gates_fallidos: gates.join(' + ') || 'Ninguno',
        cuadrante, veredicto, accion: regla[0], dueno: regla[1], motivo: regla[2],
        criterio_salida: cuadrante === 'Rojo' ? [cal.length && `PPM ≤ ${gate}× meta dos cargas seguidas`, sost.length && 'evidencia GE, BPCoC o NQC validada', fund.length && 'IATF 16949 renovado'].filter(Boolean).join('; ') : 'No aplica',
        acceso_prioritario: cuadrante === 'Verde' && !gatePcf ? 'Sí' : 'No',
        procesos_activos: activos,
        zona_riesgo: ge < n(p.ge_ko) || ratio > gate ? 'Sí' : 'No',
        a1: c === 'S' && n(r.pcf_kgco2e_unidad) > n(r.pcf_objetivo),
        a2: c === 'S' && cuadrante === 'Rojo',
        a3: (c === 'S' || c === 'A') && !falla && (alza || (iatf >= corte && iatf <= aviso)),
        prioridad: orden.indexOf(cuadrante) + 1,
      };
    });
  },
});

defineCalc('alertas', {
  inputs: ['evaluacion', 'proveedores', 'parametros'],
  title: 'Alertas A1–A3',
  description: 'Una fila por alerta disparada: A1 S con PCF sobre objetivo, A2 S en Rojo, A3 S o A con PPM al alza cerca del gate o IATF por vencer.',
  fn: (evaluacion, proveedores, parametros) => {
    const p = parametros[0];
    const por = Object.fromEntries(proveedores.map((r) => [r.supplier_id, r]));
    const filas = [];
    for (const e of evaluacion) {
      const r = por[e.supplier_id], base = { supplier_id: e.supplier_id, proveedor: r.nombre_proveedor };
      if (e.a2) filas.push({ ...base, alerta_key: `${e.supplier_id}-A2`, alerta: 'A2 · Estratégico en Rojo', condicion: e.motivo, severidad: 'Alta', plazo: '48 h', destinatario: 'Comprador, Category Manager, SQE', accion: 'New Business Hold; registro en escalación de PerMa', orden: 1 });
      if (e.a1) filas.push({ ...base, alerta_key: `${e.supplier_id}-A1`, alerta: 'A1 · Riesgo de incumplimiento 2040', condicion: `PCF ${r.pcf_kgco2e_unidad} vs. ${r.pcf_objetivo} kg CO2e por pieza`, severidad: 'Media', plazo: '60 días', destinatario: 'Comprador, Category Manager, Sustainability', accion: 'Pierde acceso prioritario en la RFQ; plan de descarbonización', orden: 2 });
      if (e.a3) filas.push({ ...base, alerta_key: `${e.supplier_id}-A3`, alerta: 'A3 · Pre-Rojo', condicion: e.ppm_ratio >= Number(p.ppm_factor_pre) ? `PPM = ${e.ppm_ratio}× meta y al alza` : `IATF 16949 vence ${r.iatf16949_vencimiento}`, severidad: 'Baja', plazo: '10 días hábiles', destinatario: 'Comprador, SQE', accion: 'Invitación a ZF League; recordatorio de renovación', orden: 3 });
    }
    return filas;
  },
});

defineCalc('gasto_mensual', {
  inputs: ['transacciones', 'demanda_mrp', 'ml_anomalias', 'parametros'],
  title: 'Gasto real vs. demanda',
  description: 'Por proveedor y mes: gasto real (suma de pedidos), gasto justificado por la demanda de ZF, su razón, si sale de la tolerancia y el puntaje del modelo de anomalías.',
  fn: (transacciones, demanda_mrp, ml_anomalias, parametros) => {
    const tol = Number(parametros[0].tolerancia_gasto);
    const real = {};
    for (const t of transacciones) { const k = `${t.supplier_id}|${t.mes}`; real[k] = (real[k] || 0) + Number(t.monto_eur); }
    const ml = Object.fromEntries(ml_anomalias.map((a) => [`${a.supplier_id}|${a.mes}`, a]));
    return demanda_mrp.map((d) => {
      const k = `${d.supplier_id}|${d.mes}`, r = Math.round(real[k] || 0), j = Number(d.gasto_justificado_eur), a = ml[k] || {};
      return {
        clave: k, supplier_id: d.supplier_id, mes: d.mes, gasto_real_eur: r, gasto_justificado_eur: j,
        razon: Math.round((r / j) * 100) / 100, fuera_tolerancia: r > j * (1 + tol),
        anomalia_ml: a.anomalia === true || a.anomalia === 'true', puntaje_ml: a.score ?? null,
      };
    });
  },
});

defineCalc('banderas', {
  inputs: ['transacciones', 'proveedores', 'parametros', 'cambios_maestro', 'gasto_mensual', 'ml_anomalias'],
  title: 'Alertas de integridad',
  description: 'Banderas rojas por reglas (pedidos partidos, factura sin recepción, sobreprecio, factura duplicada, cambio de cuenta sin verificar, gasto sin demanda) y anomalías del modelo ML. Llegan a Compliance y al comprador responsable, o a su jefe si el comprador emitió los pedidos.',
  fn: (transacciones, proveedores, parametros, cambios_maestro, gasto_mensual, ml_anomalias) => {
    const p = parametros[0], n = Number, si = (v) => v === true || v === 'true', dia = 864e5;
    const L = n(p.limite_aprobacion_eur), desde = String(p.inicio_ventana_alertas);
    const prov = Object.fromEntries(proveedores.map((r) => [r.supplier_id, r]));
    const eur = (v) => `${Math.round(v).toLocaleString('en-US')} €`;
    const pct = (v) => `${Math.round(v * 100)} %`;
    const grupo = (arr, key) => arr.reduce((m, x) => { (m[key(x)] ??= []).push(x); return m; }, {});
    const filas = [];
    const add = (sid, code, regla, origen, severidad, evidencia, monto, fecha, emisor, porComprador) => {
      const resp = prov[sid].comprador_responsable, conflicto = porComprador && emisor === resp;
      const destinatarios = conflicto ? 'Compliance + jefe de compras (conflicto: el comprador emitió los pedidos)'
        : porComprador && emisor && emisor !== resp ? `Compliance + ${resp} (pedidos emitidos por ${emisor})` : `Compliance + ${resp}`;
      filas.push({ alerta_id: `${sid}-${code}-${filas.length + 1}`, supplier_id: sid, proveedor: prov[sid].nombre_proveedor, regla, origen, severidad,
        evidencia, monto_eur: monto === null ? null : Math.round(monto), fecha, emisor: emisor || '—', conflicto: conflicto ? 'Sí' : 'No', destinatarios,
        orden: { Alta: 1, Media: 2, Baja: 3 }[severidad] });
    };
    const tx = transacciones.filter((t) => t.mes >= desde);
    // 1. Split purchase orders just below the approval limit
    const cerca = tx.filter((t) => !si(t.con_contrato) && n(t.monto_eur) >= n(p.banda_limite) * L && n(t.monto_eur) < L);
    for (const docs of Object.values(grupo(cerca, (t) => `${t.supplier_id}|${t.emisor}`))) {
      const s = docs.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
      for (let i = 0; i < s.length;) {
        let j = i;
        while (j + 1 < s.length && (Date.parse(s[j + 1].fecha) - Date.parse(s[i].fecha)) / dia <= n(p.ventana_partidos_dias)) j += 1;
        const c = s.slice(i, j + 1);
        if (c.length >= n(p.min_pedidos_partidos)) {
          const m = c.map((t) => n(t.monto_eur)), dias = (Date.parse(c.at(-1).fecha) - Date.parse(c[0].fecha)) / dia + 1;
          add(c[0].supplier_id, 'PP', 'Pedidos partidos', 'Regla', 'Alta',
            `${c.length} pedidos fuera de contrato de ${eur(Math.min(...m))} a ${eur(Math.max(...m))} en ${dias} días (límite de aprobación ${eur(L)}); suman ${eur(m.reduce((a, b) => a + b, 0))}`,
            m.reduce((a, b) => a + b, 0), c.at(-1).fecha, c[0].emisor, true);
          i = j + 1;
        } else i += 1;
      }
    }
    // 2. Invoices without goods receipt (3-way match failure)
    for (const [sid, docs] of Object.entries(grupo(tx.filter((t) => !si(t.recepcion)), (t) => t.supplier_id))) {
      const tot = docs.reduce((a, t) => a + n(t.monto_eur), 0);
      add(sid, 'SR', 'Factura sin recepción', 'Regla', 'Alta', `${docs.length} facturas por ${eur(tot)} sin recepción de mercancía (falla del 3-way match)`,
        tot, docs.map((t) => t.fecha).sort().at(-1), docs[0].emisor, false);
    }
    // 3. Price above contract
    const caros = tx.filter((t) => si(t.con_contrato) && t.precio_contrato_eur && n(t.precio_unit_eur) > n(t.precio_contrato_eur) * (1 + n(p.tolerancia_precio)));
    for (const docs of Object.values(grupo(caros, (t) => `${t.supplier_id}|${t.emisor}`))) {
      const d = docs.map((t) => n(t.precio_unit_eur) / n(t.precio_contrato_eur) - 1);
      const sobre = docs.reduce((a, t) => a + n(t.monto_eur) * (1 - n(t.precio_contrato_eur) / n(t.precio_unit_eur)), 0);
      add(docs[0].supplier_id, 'SP', 'Precio sobre contrato', 'Regla', sobre >= 100000 ? 'Alta' : 'Media',
        `${docs.length} pedidos con precio ${pct(Math.min(...d))} a ${pct(Math.max(...d))} sobre contrato desde ${docs.map((t) => t.fecha).sort()[0]}; sobrecosto estimado ${eur(sobre)}`,
        sobre, docs.map((t) => t.fecha).sort().at(-1), docs[0].emisor, true);
    }
    // 4. Duplicate invoices
    for (const docs of Object.values(grupo(tx, (t) => `${t.supplier_id}|${t.factura}`))) {
      if (docs.length < 2) continue;
      const f = docs.map((t) => t.fecha).sort();
      add(docs[0].supplier_id, 'FD', 'Factura duplicada', 'Regla', 'Alta', `Factura ${docs[0].factura} registrada ${docs.length} veces (${eur(n(docs[0].monto_eur))} cada vez; ${f.join(' y ')})`,
        n(docs[0].monto_eur) * (docs.length - 1), f.at(-1), docs[0].emisor, false);
    }
    // 5. Unverified bank-account change followed by payments
    for (const c of cambios_maestro) {
      if (c.campo !== 'Cuenta bancaria' || si(c.verificado)) continue;
      const ini = Date.parse(c.fecha), fin = ini + n(p.ventana_cambio_cuenta_dias) * dia;
      const pagos = transacciones.filter((t) => t.supplier_id === c.supplier_id && Date.parse(t.fecha) >= ini && Date.parse(t.fecha) <= fin);
      if (!pagos.length) continue;
      const tot = pagos.reduce((a, t) => a + n(t.monto_eur), 0);
      add(c.supplier_id, 'CC', 'Cambio de cuenta sin verificar', 'Regla', 'Alta',
        `Cuenta bancaria cambiada el ${c.fecha} sin verificación; ${pagos.length} pagos por ${eur(tot)} en los ${n(p.ventana_cambio_cuenta_dias)} días siguientes`,
        tot, pagos.map((t) => t.fecha).sort().at(-1), null, false);
    }
    // 6. Spend above what demand justifies (2 of the last 3 months)
    const meses = [...new Set(gasto_mensual.map((g) => g.mes))].sort().slice(-3);
    for (const [sid, g] of Object.entries(grupo(gasto_mensual.filter((g) => meses.includes(g.mes)), (g) => g.supplier_id))) {
      const fuera = g.filter((x) => x.fuera_tolerancia === true || x.fuera_tolerancia === 'true');
      if (fuera.length < 2) continue;
      const exceso = fuera.reduce((a, x) => a + n(x.gasto_real_eur) - n(x.gasto_justificado_eur), 0);
      const media = fuera.reduce((a, x) => a + n(x.razon), 0) / fuera.length - 1;
      const emisores = tx.filter((t) => t.supplier_id === sid && meses.includes(t.mes)).map((t) => t.emisor);
      const top = emisores.sort((a, b) => emisores.filter((x) => x === b).length - emisores.filter((x) => x === a).length)[0];
      add(sid, 'GD', 'Gasto sin demanda', 'Regla', 'Media', `Gasto ${pct(media)} sobre lo justificado por la demanda en ${fuera.length} de los últimos 3 meses; exceso ${eur(exceso)}`,
        exceso, fuera.map((x) => x.mes).sort().at(-1), top, true);
    }
    // 7. Isolation Forest anomalies (trained offline in Python); a supplier with a conflict-of-interest alert keeps the buyer out
    const enConflicto = new Set(filas.filter((f) => f.conflicto === 'Sí').map((f) => f.supplier_id));
    for (const [sid, a] of Object.entries(grupo(ml_anomalias.filter((a) => (a.anomalia === true || a.anomalia === 'true') && a.mes >= desde), (a) => a.supplier_id))) {
      const top = a.slice().sort((x, y) => n(y.score) - n(x.score))[0];
      add(sid, 'ML', 'Anomalía transaccional', 'Modelo ML', n(top.score) >= 0.75 ? 'Media' : 'Baja',
        `Puntaje ${n(top.score).toFixed(2)} en ${top.mes}${a.length > 1 ? ` (${a.length} meses anómalos)` : ''}: ${top.factores}`,
        null, a.map((x) => x.mes).sort().at(-1), enConflicto.has(sid) ? prov[sid].comprador_responsable : null, enConflicto.has(sid));
    }
    return filas;
  },
});

defineCalc('dependencia_commodity', {
  inputs: ['proveedores', 'evaluacion', 'commodities', 'parametros', 'banderas'],
  title: 'Dependencia por commodity',
  description: 'Concentración del gasto (participación del proveedor principal, HHI), cuadrante de Kraljic (impacto por gasto vs. la mediana, riesgo de suministro asignado) y alternativas calificadas (S, A o Z fuera de Rojo), señalando las que tienen alertas de integridad abiertas.',
  fn: (proveedores, evaluacion, commodities, parametros, banderas) => {
    const conAlerta = new Set(banderas.map((b) => b.supplier_id));
    const nombre = (r) => r.nombre_proveedor + (conAlerta.has(r.supplier_id) ? ' (con alerta de integridad abierta)' : '');
    const p = parametros[0], u = Number(p.umbral_dependencia), ur = Number(p.umbral_riesgo_kraljic);
    const ev = Object.fromEntries(evaluacion.map((e) => [e.supplier_id, e]));
    const by = proveedores.reduce((m, r) => { (m[r.commodity] ??= []).push(r); return m; }, {});
    const totales = Object.values(by).map((l) => l.reduce((a, r) => a + Number(r.gasto_anual_meur), 0)).sort((a, b) => a - b);
    const k = totales.length, mediana = k % 2 ? totales[(k - 1) / 2] : (totales[k / 2 - 1] + totales[k / 2]) / 2;
    return commodities.map((c) => {
      const l = (by[c.commodity] || []).slice().sort((a, b) => Number(b.gasto_anual_meur) - Number(a.gasto_anual_meur));
      const total = l.reduce((a, r) => a + Number(r.gasto_anual_meur), 0), top = l[0];
      const share = total ? Number(top.gasto_anual_meur) / total : 0;
      const hhi = Math.round(l.reduce((a, r) => a + (100 * Number(r.gasto_anual_meur) / total) ** 2, 0));
      const impacto = total >= mediana ? 'Alto' : 'Bajo', riesgo = Number(c.riesgo_suministro) >= ur ? 'Alto' : 'Bajo';
      const kraljic = impacto === 'Alto' ? (riesgo === 'Alto' ? 'Estratégico' : 'Apalancamiento') : (riesgo === 'Alto' ? 'Cuello de botella' : 'Rutinario');
      const alt = l.slice(1).filter((r) => ['S', 'A', 'Z'].includes(r.clasificacion_zf) && !['Rojo', 'Bloqueado'].includes(ev[r.supplier_id]?.cuadrante));
      const diagnostico = share < u ? 'Diversificado'
        : ['Apalancamiento', 'Rutinario'].includes(kraljic) ? (alt.length ? 'Dependencia innecesaria' : 'Dependencia sin alternativa') : 'Dependencia estratégica';
      const recomendacion = {
        'Diversificado': 'Sin acción',
        'Dependencia innecesaria': `Desarrollar doble fuente: mover volumen a ${alt.slice(0, 2).map(nombre).join(' y ')}`,
        'Dependencia sin alternativa': 'Calificar un proveedor alternativo: los demás del commodity están bloqueados, no deseados o en Rojo',
        'Dependencia estratégica': 'Plan de continuidad: inventario de seguridad y segunda fuente calificada en espera',
      }[diagnostico];
      return {
        commodity: c.commodity, gasto_total_meur: Math.round(total * 10) / 10, mediana_gasto_meur: Math.round(mediana * 10) / 10,
        n_proveedores: l.length, principal_id: top ? top.supplier_id : null, proveedor_principal: top ? top.nombre_proveedor : '—',
        participacion_principal: Math.round(share * 1000) / 1000, hhi, riesgo_suministro: Number(c.riesgo_suministro), motivo_riesgo: c.motivo_riesgo,
        impacto, riesgo, kraljic, alternativas_calificadas: alt.length, alternativas_nombres: alt.map(nombre).join(', ') || '—',
        diagnostico, recomendacion,
      };
    });
  },
});

defineCalc('dependencia', {
  inputs: ['proveedores', 'dependencia_commodity', 'finanzas_proveedor', 'parametros'],
  title: 'Dependencia por proveedor',
  description: 'Participación de cada proveedor en el gasto de su commodity, diagnóstico de dependencia (para el principal) y dependencia inversa: qué parte de las ventas del proveedor viene de ZF.',
  fn: (proveedores, dependencia_commodity, finanzas_proveedor, parametros) => {
    const ui = Number(parametros[0].umbral_dependencia_inversa);
    const com = Object.fromEntries(dependencia_commodity.map((c) => [c.commodity, c]));
    const fin = Object.fromEntries(finanzas_proveedor.map((f) => [f.supplier_id, f]));
    const tot = proveedores.reduce((m, r) => { m[r.commodity] = (m[r.commodity] || 0) + Number(r.gasto_anual_meur); return m; }, {});
    return proveedores.map((r) => {
      const c = com[r.commodity], principal = c && c.principal_id === r.supplier_id;
      const share = Number(r.gasto_anual_meur) / tot[r.commodity];
      const ventas = Number(fin[r.supplier_id]?.ventas_totales_meur);
      const inv = ventas ? Number(r.gasto_anual_meur) / ventas : null;
      const diag = principal && c.diagnostico !== 'Diversificado' ? c.diagnostico : 'Sin dependencia relevante';
      const dependenciaInversa = inv !== null && inv >= ui;
      const rec = [principal && c.diagnostico !== 'Diversificado' ? c.recomendacion : '',
        dependenciaInversa ? `ZF es ${Math.round(inv * 100)} % de sus ventas: vigilar su salud financiera y evitar recortes bruscos de volumen` : ''].filter(Boolean).join('. ') || 'Sin acción';
      return {
        supplier_id: r.supplier_id, commodity: r.commodity, kraljic: c ? c.kraljic : '—', participacion: Math.round(share * 1000) / 1000,
        pct_ventas_zf: inv === null ? null : Math.round(inv * 1000) / 1000, diagnostico: diag, dependencia_inversa: dependenciaInversa ? 'Sí' : 'No',
        recomendacion: rec, con_alerta: diag !== 'Sin dependencia relevante' || dependenciaInversa,
      };
    });
  },
});

defineCalc('pronostico', {
  inputs: ['ml_comportamiento', 'evaluacion', 'parametros'],
  title: 'Pronóstico por proveedor',
  description: 'Segmento según consistencia histórica y probabilidad (modelo de regresión logística entrenado en Python) de cruzar el gate de calidad en 3 meses, con la recomendación. El modelo no cambia el cuadrante: los gates siguen mandando.',
  fn: (ml_comportamiento, evaluacion, parametros) => {
    const p = parametros[0], up = Number(p.umbral_prob), uc = Number(p.umbral_consistencia), mm = Number(p.min_meses_historial);
    const ev = Object.fromEntries(evaluacion.map((e) => [e.supplier_id, e]));
    const orden = { 'Deterioro estructural': 1, 'Bache temporal': 2, 'Vigilar': 3, 'Sin pronóstico': 4, 'Estable': 5 };
    return ml_comportamiento.map((m) => {
      const e = ev[m.supplier_id] || {}, prob = m.prob_falla_3m === null ? null : Number(m.prob_falla_3m);
      const cons = m.consistencia === null ? null : Number(m.consistencia), zf = Number(m.pct_ppm_causa_zf_12m);
      const seg = prob === null || Number(m.meses_historial) < mm ? 'Sin pronóstico'
        : cons >= uc ? (prob >= up ? 'Bache temporal' : 'Estable') : (prob >= up ? 'Deterioro estructural' : 'Vigilar');
      const rojo = e.cuadrante === 'Rojo';
      let rec = {
        'Sin pronóstico': 'Proveedor con menos de 12 meses de historial: aplicar solo las reglas, sin pronóstico',
        'Estable': rojo ? 'Su historial respalda dar un plazo de mejora de 90 días antes de buscar salida; el hold sigue por regla' : 'Sin acción adicional',
        'Bache temporal': `Merece oportunidad: plan de mejora de 90 días con seguimiento mensual; no iniciar salida${rojo ? '. El hold sigue por regla' : ''}`,
        'Vigilar': 'Historial irregular aunque hoy sin señal de falla: revisar mes a mes durante 3 meses',
        'Deterioro estructural': 'Iniciar calificación de segunda fuente; evaluar salida al vencer el contrato',
      }[seg];
      if (e.cuadrante === 'Bloqueado') rec = 'Proveedor bloqueado: el pronóstico solo es informativo';
      if (zf >= 25) rec += `. Antes de decidir, revisar la atribución: ${zf} % de los defectos del último año tienen causa raíz en ZF`;
      return {
        supplier_id: m.supplier_id, segmento: seg, prob_falla_3m: prob, consistencia: cons, meses_historial: Number(m.meses_historial),
        confianza: m.confianza, factores: m.factores, pct_ppm_causa_zf_12m: zf, recomendacion: rec, orden: orden[seg],
      };
    });
  },
});

defineCalc('conteos', {
  inputs: ['proveedores', 'evaluacion', 'parametros', 'banderas', 'dependencia', 'pronostico'],
  title: 'Conteos por vista',
  description: 'Proveedores, Rojo, aptos, zona de riesgo, sostenibilidad, alertas de integridad, dependencias y segmentos del pronóstico por clasificación, para cada combinación de filtros (Todos = sin filtrar).',
  fn: (proveedores, evaluacion, parametros, banderas, dependencia, pronostico) => {
    const ko = Number(parametros[0].ge_ko);
    const ev = Object.fromEntries(evaluacion.map((e) => [e.supplier_id, e]));
    const dep = Object.fromEntries(dependencia.map((d) => [d.supplier_id, d]));
    const pr = Object.fromEntries(pronostico.map((d) => [d.supplier_id, d]));
    const ban = banderas.reduce((m, b) => { const x = (m[b.supplier_id] ??= { n: 0, monto: 0, conf: 0 }); x.n += 1; x.monto += Number(b.monto_eur) || 0; x.conf += b.conflicto === 'Sí' ? 1 : 0; return m; }, {});
    const dims = ['comprador_responsable', 'commodity', 'division_zf', 'pais_planta'];
    const acc = new Map();
    const campos = ['proveedores', 'en_rojo', 'aptos', 'zona_riesgo', 'alertas_integridad', 'prov_con_alerta', 'conflictos', 'dep_innecesaria', 'dep_sin_alternativa', 'dep_estrategica', 'dep_inversa', 'seg_deterioro', 'seg_bache', 'seg_vigilar', 'seg_sin', 'seg_estable'];
    const fila = (k, c) => {
      const id = [...k, c].join('|');
      if (!acc.has(id)) acc.set(id, { comprador: k[0], commodity: k[1], division: k[2], pais: k[3], clasificacion: c, ...Object.fromEntries(campos.map((f) => [f, 0])), monto: 0, sus: 0, ge_ok: 0 });
      return acc.get(id);
    };
    for (const r of proveedores) {
      const e = ev[r.supplier_id], d = dep[r.supplier_id] || {}, s = pr[r.supplier_id] || {}, b = ban[r.supplier_id];
      const v = {
        proveedores: 1, en_rojo: e.cuadrante === 'Rojo', aptos: e.veredicto === 'Apto', zona_riesgo: e.zona_riesgo === 'Sí',
        alertas_integridad: b ? b.n : 0, prov_con_alerta: Boolean(b), conflictos: b ? b.conf : 0,
        dep_innecesaria: d.diagnostico === 'Dependencia innecesaria', dep_sin_alternativa: d.diagnostico === 'Dependencia sin alternativa',
        dep_estrategica: d.diagnostico === 'Dependencia estratégica', dep_inversa: d.dependencia_inversa === 'Sí',
        seg_deterioro: s.segmento === 'Deterioro estructural', seg_bache: s.segmento === 'Bache temporal', seg_vigilar: s.segmento === 'Vigilar',
        seg_sin: s.segmento === 'Sin pronóstico', seg_estable: s.segmento === 'Estable',
      };
      for (let m = 0; m < 16; m += 1) {
        const k = dims.map((dm, i) => (m & (1 << i) ? r[dm] : 'Todos'));
        for (const c of ['S', 'A', 'Z', 'U', 'G']) fila(k, c);
        for (const c of [r.clasificacion_zf, 'Todas']) {
          const a = fila(k, c);
          for (const f of campos) a[f] += Number(v[f]);
          a.monto += b ? b.monto : 0;
          a.sus += Number(r.sus_score);
          a.ge_ok += Number(r.ge2025_pct) >= ko ? 1 : 0;
        }
      }
    }
    return [...acc.values()].map(({ sus, ge_ok, monto, ...a }) => ({
      ...a, monto_revision_meur: Math.round(monto / 1e5) / 10,
      sus_promedio: a.proveedores ? Math.round((sus / a.proveedores) * 10) / 10 : null, pct_ge100: a.proveedores ? Math.round((100 * ge_ok) / a.proveedores) : null,
    }));
  },
});

defineCalc('rfq_elegibles', {
  inputs: ['rfqs', 'proveedores', 'evaluacion'],
  title: 'Elegibilidad por RFQ',
  description: 'Proveedores del commodity de cada RFQ abierta: excluidos (G, U, Rojo), no elegibles por PCF, condicionados, elegibles o con acceso prioritario.',
  fn: (rfqs, proveedores, evaluacion) => {
    const ev = Object.fromEntries(evaluacion.map((e) => [e.supplier_id, e]));
    const estados = ['Elegible · prioritario', 'Elegible', 'Elegible condicionado', 'No elegible (PCF)', 'Excluido'];
    const filas = [];
    for (const q of rfqs) {
      for (const r of proveedores) {
        if (r.commodity !== q.commodity) continue;
        const e = ev[r.supplier_id], c = r.clasificacion_zf;
        const reportado = r.pcf_reportado === true || r.pcf_reportado === 'true';
        const pcf = reportado ? Number(r.pcf_kgco2e_unidad) : null, obj = Number(r.pcf_objetivo);
        let estado = 'Elegible condicionado', motivo = e.motivo;
        if (c === 'G' || c === 'U') { estado = 'Excluido'; motivo = `Clasificación ${c}`; }
        else if (e.cuadrante === 'Rojo') estado = 'Excluido';
        else if (!reportado || pcf > obj) { estado = 'No elegible (PCF)'; motivo = reportado ? `PCF ${pcf} sobre objetivo de ${obj} kg CO2e por pieza` : 'PCF no reportado'; }
        else if (e.cuadrante === 'Verde') estado = q.prioritaria === true || q.prioritaria === 'true' ? 'Elegible · prioritario' : 'Elegible';
        else if (e.veredicto === 'Apto') estado = 'Elegible';
        filas.push({ rfq_id: q.rfq_id, supplier_id: r.supplier_id, proveedor: r.nombre_proveedor, clasificacion: c, cuadrante: e.cuadrante, pcf_kgco2e_unidad: pcf, pcf_objetivo: obj, elegibilidad: estado, motivo, orden: estados.indexOf(estado) + 1 });
      }
    }
    return filas;
  },
});

defineCalc('rfq_resumen', {
  inputs: ['rfq_elegibles'],
  title: 'Resumen por RFQ',
  description: 'Por RFQ abierta: proveedores elegibles (con o sin condición), con acceso prioritario, y fuera (excluidos o no elegibles por PCF).',
  fn: (rfq_elegibles) => {
    const acc = {};
    for (const f of rfq_elegibles) {
      const a = (acc[f.rfq_id] ??= { rfq_id: f.rfq_id, candidatos: 0, elegibles: 0, prioritarios: 0, fuera: 0 });
      a.candidatos += 1;
      if (String(f.elegibilidad).startsWith('Elegible')) a.elegibles += 1; else a.fuera += 1;
      if (f.elegibilidad === 'Elegible · prioritario') a.prioritarios += 1;
    }
    return Object.values(acc);
  },
});


/** Ejecuta todos los cálculos en orden de dependencias. Devuelve { id: { status, data, message? } }. */
export function runCalcs(datasets) {
  const out = {};
  const ready = (id) => (id in datasets ? datasets[id].status === 'ok' : out[id]?.status === 'ok');
  const value = (id) => (id in datasets ? datasets[id].data : out[id].data);
  const pending = new Set(Object.keys(CALCS));
  let progress = true;
  while (pending.size && progress) {
    progress = false;
    for (const id of [...pending]) {
      const { inputs, fn } = CALCS[id];
      const missing = inputs.filter((i) => !(i in datasets) && !(i in out));
      if (missing.length) continue;
      pending.delete(id);
      progress = true;
      if (!inputs.every(ready)) {
        out[id] = { status: 'error', data: [], message: `Falta una entrada: ${inputs.filter((i) => !ready(i)).join(', ')}` };
        continue;
      }
      try {
        out[id] = { status: 'ok', data: fn(...inputs.map(value)) };
      } catch (err) {
        console.error(`Cálculo ${id} falló`, err);
        out[id] = { status: 'error', data: [], message: String(err) };
      }
    }
  }
  for (const id of pending) out[id] = { status: 'error', data: [], message: 'Dependencia circular o desconocida' };
  return out;
}

/** Metadatos de cada cálculo (título y descripción), útiles para documentar o auditar. */
export const CALC_INFO = Object.fromEntries(Object.entries(CALCS).map(([id, d]) => [id, { title: d.title, description: d.description, inputs: d.inputs }]));
