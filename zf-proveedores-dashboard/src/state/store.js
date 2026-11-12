/**
 * Estado de la aplicación: datasets cargados, resultados de los cálculos y filtros activos.
 * Reemplaza la API "dash" del entorno donde se prototipó el dashboard, con la misma forma,
 * para que la interfaz no cambie.
 */
export const DEFAULT_PARAMS = Object.freeze({
  comprador: null,
  commodity: null,
  division: null,
  pais: null,
  clasif: null,
  cuadrante: null,
  rfq: null,
  proveedor: null,
  yeje: 'ge',
});

export function createStore(defaults = DEFAULT_PARAMS) {
  let params = { ...defaults };
  let tables = {};
  const listeners = new Set();
  let scheduled = false;

  const notify = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      listeners.forEach((fn) => fn());
    });
  };

  return {
    /** { status: 'loading' | 'ok' | 'error', data: [...] } de un dataset o cálculo. */
    data(id) {
      return tables[id] ?? { status: 'loading', data: [] };
    },
    /** Reemplaza todas las tablas (datasets + cálculos) y redibuja. */
    setTables(next) {
      tables = { ...tables, ...next };
      notify();
    },
    params() {
      return { ...params };
    },
    setParams(patch) {
      params = { ...params, ...patch };
      notify();
    },
    resetParams() {
      params = { ...defaults };
      notify();
    },
    /** Guarda la pestaña activa en la URL (#integridad, #dependencia…) sin recargar. */
    setLink(name) {
      history.replaceState(null, '', `#${name}`);
    },
    /** Registra una función de dibujo: corre ahora y cada vez que cambian datos, filtros o el ancho. */
    onData(fn) {
      listeners.add(fn);
      fn();
    },
    refresh: notify,
  };
}
