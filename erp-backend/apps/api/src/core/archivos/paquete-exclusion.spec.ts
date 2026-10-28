import { esRutaDeManifiestoBackend, excluirDelPaquete, MANIFIESTO_BACKEND } from './paquete-exclusion';

describe('exclusión del paquete', () => {
  const excluidas = [
    'Node_Modules/package.json',
    'DIST/apps/api/main.js',
    'LOGS/error.log',
    'Certs/clave.pem',
    'Coverage/lcov.info',
    'storage/pacientes/archivo',
    'storage/clientes/archivo',
    'storage/otro/datos.csv',
    '.ENV',
    '.envrc',
    '.env.production',
    '.env.production.example',
    '.env.local.example',
    'dump.sql.gz',
    'clave.pem.txt',
    'certificado.key.backup',
    'archivo.tmp',
    'Backups/notas.txt',
    'D:\\datos\\secretos\\.ENV',
    './storage/otro/datos.csv',
    'C:/app/logs/error.log',
    'foo/bar\\Certs\\clave.pem',
    'node_modules/.env.example',
    'uploads/paciente.pdf',
  ];

  const conservadas = [
    '.env.example',
    './.env.example',
    'app.js',
    'main.js',
    'package.json',
    'package-lock.json',
    'assets/branding/logo-clinica-lopez.png',
    'docs/despliegue-https.md',
    'apps/api/src/main.ts',
    'README.md',
  ];

  it('excluye variaciones de mayúsculas, carpetas, extensiones y rutas absolutas', () => {
    for (const ruta of excluidas) {
      expect(excluirDelPaquete(ruta)).toBe(true);
    }
  });

  it('conserva la plantilla exacta y los archivos de la aplicación', () => {
    for (const ruta of conservadas) {
      expect(excluirDelPaquete(ruta)).toBe(false);
    }
  });

  it('también excluye el código que vive en una carpeta pacientes o clientes', () => {
    expect(excluirDelPaquete('apps/api/src/erp/pacientes/pacientes.service.ts')).toBe(true);
    expect(excluirDelPaquete('apps/api/src/erp/clientes/notas.md')).toBe(true);
  });
});

describe('manifiesto cerrado del backend', () => {
  it('acepta solo las cinco rutas de la raíz Node', () => {
    expect(MANIFIESTO_BACKEND).toEqual([
      'app.js',
      'main.js',
      'package.json',
      'package-lock.json',
      'assets/branding/logo-clinica-lopez.png',
    ]);
    for (const ruta of MANIFIESTO_BACKEND) {
      expect(esRutaDeManifiestoBackend(ruta)).toBe(true);
      expect(excluirDelPaquete(ruta)).toBe(false);
    }
    expect(esRutaDeManifiestoBackend('assets\\branding\\logo-clinica-lopez.png')).toBe(true);
    expect(esRutaDeManifiestoBackend('assets/branding\\logo-clinica-lopez.png')).toBe(true);
  });

  it('rechaza escapes, absolutas, mayúsculas y nombres parecidos', () => {
    for (const ruta of [
      '../package.json',
      '../../.env',
      'D:\\erp-backend\\package.json',
      '/home/app/package.json',
      './app.js',
      '././app.js',
      '/app.js',
      '\\app.js',
      'app.js/',
      'app.js ',
      ' APP.JS',
      'APP.JS',
      'assets/../package.json',
      'assets\\..\\package.json',
      'DIST/apps/api/main.js',
      'dist/apps/api/main.js',
      'node_modules/bcrypt/package.json',
      '.env.example',
      'uploads/archivo',
      'storage/archivo',
      'assets/branding/otro-logo.png',
      'assets/branding/logo-clinica-lopez.png/extra',
      'Assets/branding/logo-clinica-lopez.png',
    ]) {
      expect(esRutaDeManifiestoBackend(ruta)).toBe(false);
    }
  });
});
