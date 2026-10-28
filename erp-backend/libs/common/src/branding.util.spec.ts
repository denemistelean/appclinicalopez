import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { NOMBRE_PAQUETE } from './uploads-root';
import { rutaLogoClinica } from './branding.util';

const limpiezas: string[] = [];

afterEach(() => {
  for (const dir of limpiezas.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function raizSintetica(): { raiz: string; modulo: string } {
  const raiz = mkdtempSync(join(tmpdir(), 'cli-logo-'));
  limpiezas.push(raiz);
  writeFileSync(join(raiz, 'package.json'), JSON.stringify({ name: NOMBRE_PAQUETE }));
  const modulo = join(raiz, 'dist', 'apps', 'api');
  mkdirSync(modulo, { recursive: true });
  return { raiz, modulo };
}

describe('ruta del logo para PDF', () => {
  it('usa el logo que está dentro de la raíz Node', () => {
    const { raiz, modulo } = raizSintetica();
    const logo = join(raiz, 'assets', 'branding', 'logo-clinica-lopez.png');
    mkdirSync(join(raiz, 'assets', 'branding'), { recursive: true });
    writeFileSync(logo, 'sintetico');
    const encontrada = rutaLogoClinica(modulo);
    expect(encontrada && resolve(encontrada).toLowerCase()).toBe(resolve(logo).toLowerCase());
  });

  it('devuelve null si el logo no está en esa raíz', () => {
    const { modulo } = raizSintetica();
    expect(rutaLogoClinica(modulo)).toBeNull();
  });

  it('no toma un logo colocado fuera de la raíz, aunque esté varios niveles arriba', () => {
    const padre = mkdtempSync(join(tmpdir(), 'cli-logo-padre-'));
    limpiezas.push(padre);
    const raiz = join(padre, 'app');
    mkdirSync(join(raiz, 'dist', 'apps', 'api'), { recursive: true });
    writeFileSync(join(raiz, 'package.json'), JSON.stringify({ name: NOMBRE_PAQUETE }));
    const modulo = join(raiz, 'dist', 'apps', 'api');
    const fuera = join(padre, 'assets', 'branding');
    mkdirSync(fuera, { recursive: true });
    writeFileSync(join(fuera, 'logo-clinica-lopez.png'), 'otro');
    expect(rutaLogoClinica(modulo)).toBeNull();
    expect(rutaLogoClinica(resolve(modulo, '..', '..', '..'))).toBeNull();
  });

  it('no recurre al directorio de trabajo ni a tres niveles fijos de __dirname', () => {
    const fuente = readFileSync(join(__dirname, 'branding.util.ts'), 'utf8');
    expect(fuente).not.toContain('process.cwd()');
    expect(fuente).not.toContain("join(__dirname, '..', '..', '..'");
  });
});

function puedeEnlaceDeArchivo(): boolean {
  const base = mkdtempSync(join(tmpdir(), 'cli-logo-link-'));
  limpiezas.push(base);
  try {
    const objetivo = join(base, 'objetivo.png');
    writeFileSync(objetivo, 'x');
    const enlace = join(base, 'enlace.png');
    symlinkSync(objetivo, enlace, 'file');
    return lstatSync(enlace).isSymbolicLink();
  } catch {
    return false;
  }
}

const enlaceArchivo = puedeEnlaceDeArchivo();

(enlaceArchivo ? describe : describe.skip)('logo por enlace', () => {
  it('no sigue un enlace simbólico hacia otro logo', () => {
    const { raiz, modulo } = raizSintetica();
    const marca = join(raiz, 'assets', 'branding');
    mkdirSync(marca, { recursive: true });
    const fuera = join(raiz, 'logo-fuera.png');
    writeFileSync(fuera, 'otro');
    symlinkSync(fuera, join(marca, 'logo-clinica-lopez.png'), 'file');
    expect(rutaLogoClinica(modulo)).toBeNull();
  });
});
