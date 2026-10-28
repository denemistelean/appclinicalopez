/**
 * Entrada de cPanel. Application startup file = app.js
 *
 * En el servidor este archivo y el main.js compilado
 * (dist/apps/api/main.js) quedan en el mismo directorio.
 * node_modules se instala en el servidor.
 * El arranque TCP local sigue siendo: node dist/apps/api/main
 */
if (typeof PhusionPassenger !== 'undefined') {
  PhusionPassenger.configure({ autoInstall: false });
}

try {
  require('./main.js');
} catch (err) {
  const fs = require('fs');
  const msg = err && err.stack ? err.stack : String(err);
  console.error('[app.js] No se pudo cargar main.js:', msg);
  try {
    fs.writeFileSync(__dirname + '/bootstrap-error.log', new Date().toISOString() + '\n' + msg + '\n');
  } catch (_) {}
  throw err;
}
