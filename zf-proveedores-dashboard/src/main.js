/**
 * Punto de entrada: carga estilos y fuentes, monta la interfaz, trae los datos y corre las reglas.
 */
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/source-serif-4/400.css';
import './styles/tokens.css';
import './styles/dashboard.css';

import { createStore } from './state/store.js';
import { loadDatasets } from './data/dataService.js';
import { runCalcs } from './logic/calcs.js';
import { mountDashboard } from './ui/dashboard.js';

const store = createStore();
mountDashboard(store);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(store.refresh, 150);
});

function showBanner(text, isError = false) {
  const el = document.getElementById('app-banner');
  el.textContent = text;
  el.classList.toggle('is-error', isError);
  el.hidden = false;
}

async function start() {
  const datasets = await loadDatasets();
  const failed = Object.entries(datasets).filter(([, d]) => d.status !== 'ok');
  if (failed.length) {
    showBanner(`No se pudieron cargar ${failed.length} fuentes de datos: ${failed.map(([n, d]) => `${n} (${d.message})`).join('; ')}`, true);
  }
  const calcs = runCalcs(datasets);
  const calcErrors = Object.entries(calcs).filter(([, c]) => c.status !== 'ok');
  if (calcErrors.length && !failed.length) {
    showBanner(`Fallaron ${calcErrors.length} cálculos: ${calcErrors.map(([n]) => n).join(', ')}. Revisa la consola.`, true);
  }
  store.setTables({ ...datasets, ...calcs });
}

start().catch((err) => {
  console.error(err);
  showBanner(`Error al iniciar el dashboard: ${err.message}`, true);
});
