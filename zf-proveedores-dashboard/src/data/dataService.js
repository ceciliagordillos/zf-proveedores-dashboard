/**
 * Capa de datos: el único lugar que sabe de dónde vienen los datos.
 *
 * Hoy lee archivos JSON estáticos de /public/data (datos de demostración).
 * Para conectar una API o base de datos en Azure no hay que tocar la interfaz:
 *   1. Publica un endpoint que devuelva el mismo formato (un arreglo de filas) por dataset,
 *      por ejemplo una Azure Function en /api/datasets/{nombre}.
 *   2. Define VITE_DATA_URL=/api/datasets en un archivo .env (o en la configuración de la app).
 *
 * Cada dataset debe responder con un arreglo de objetos, o un objeto con la propiedad "rows" o "data".
 */
export const DATASETS = [
  'proveedores', // maestro + KPIs de PerMa / SAP por proveedor
  'historial', // 36 meses de PPM, PPM con causa ZF, score y entregas
  'rfqs', // RFQs abiertas
  'parametros', // umbrales de todas las reglas (una fila)
  'transacciones', // pedidos y facturas (procure-to-pay)
  'demanda_mrp', // gasto mensual justificado por la demanda de ZF
  'cambios_maestro', // cambios a datos maestros (cuenta bancaria, domicilio)
  'finanzas_proveedor', // ventas totales de cada proveedor
  'commodities', // riesgo de suministro por commodity (Kraljic)
  'ml_anomalias', // salida del Isolation Forest (Python)
  'ml_comportamiento', // salida de la regresión logística (Python)
  'ml_modelo', // ficha de los modelos y sus métricas
];

const BASE_URL = (import.meta.env.VITE_DATA_URL || `${import.meta.env.BASE_URL}data`).replace(/\/$/, '');

async function fetchDataset(name) {
  const res = await fetch(`${BASE_URL}/${name}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const body = await res.json();
  const rows = Array.isArray(body) ? body : body.rows ?? body.data;
  if (!Array.isArray(rows)) throw new Error(`${name}: formato inesperado (se esperaba un arreglo de filas)`);
  return rows;
}

/** Carga todos los datasets en paralelo. Uno que falle no detiene a los demás. */
export async function loadDatasets(names = DATASETS) {
  const results = await Promise.allSettled(names.map(fetchDataset));
  return Object.fromEntries(
    names.map((name, i) => {
      const r = results[i];
      return [name, r.status === 'fulfilled' ? { status: 'ok', data: r.value } : { status: 'error', data: [], message: String(r.reason?.message ?? r.reason) }];
    }),
  );
}
