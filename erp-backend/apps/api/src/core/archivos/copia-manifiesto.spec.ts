import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { copiarManifiestoBackend, ErrorCopiaManifiesto, segmentosRelativos } from './copia-manifiesto';

const limpiezas: string[] = [];

function limpiarTodo(): void {
  for (const dir of limpiezas.splice(0)) rmSync(dir, { recursive: true, force: true });
}

afterEach(limpiarTodo);

function baseTemporal(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cli-copia-'));
  limpiezas.push(dir);
  return dir;
}

function escribirOrigen(origen: string, salvo: string[] = []): void {
  const poner = (relativo: string, contenido: string) => {
    if (salvo.includes(relativo)) return;
    const destino = join(origen, ...relativo.split('/'));
    mkdirSync(join(destino, '..'), { recursive: true });
    writeFileSync(destino, contenido);
  };
  poner('app.js', 'app');
  poner('dist/apps/api/main.js', 'main');
  poner('package.json', '{}');
  poner('package-lock.json', '{}');
  poner('assets/branding/logo-clinica-lopez.png', 'png');
}

function fixture(salvo: string[] = []): { origen: string; destino: string } {
  const base = baseTemporal();
  const origen = join(base, 'origen');
  const destino = join(base, 'destino');
  mkdirSync(origen);
  mkdirSync(destino);
  escribirOrigen(origen, salvo);
  return { origen, destino };
}

function nombres(dir: string): string[] {
  return readdirSync(dir);
}

function puedeEnlace(tipo: 'file' | 'dir'): boolean {
  const base = baseTemporal();
  try {
    const objetivo = join(base, 'objetivo');
    const enlace = join(base, 'enlace');
    if (tipo === 'file') writeFileSync(objetivo, 'x');
    else mkdirSync(objetivo);
    symlinkSync(objetivo, enlace, tipo);
    return lstatSync(enlace).isSymbolicLink();
  } catch {
    return false;
  }
}

const enlaceArchivo = puedeEnlace('file');
const enlaceDirectorio = puedeEnlace('dir');

describe('copia segura del manifiesto', () => {
  it('copia los cinco archivos sintéticos y deja main.js en la raíz', () => {
    const { origen, destino } = fixture();
    writeFileSync(join(origen, 'extra.txt'), 'no-copiar');
    const copiados = copiarManifiestoBackend({
      raizOrigen: origen.replace(/\\/g, '/'),
      raizDestino: destino,
    });
    expect(copiados).toEqual([
      'app.js',
      'main.js',
      'package.json',
      'package-lock.json',
      'assets/branding/logo-clinica-lopez.png',
    ]);
    expect(readFileSync(join(destino, 'main.js'), 'utf8')).toBe('main');
    expect(readFileSync(join(destino, 'assets', 'branding', 'logo-clinica-lopez.png'), 'utf8')).toBe('png');
    expect(nombres(destino)).not.toContain('extra.txt');
    expect(nombres(destino)).not.toContain('dist');
  });

  it('un fallo en la última validación no deja copias parciales', () => {
    const { origen, destino } = fixture(['assets/branding/logo-clinica-lopez.png']);
    expect(() => copiarManifiestoBackend({ raizOrigen: origen, raizDestino: destino })).toThrow(ErrorCopiaManifiesto);
    expect(nombres(destino)).toEqual([]);
  });

  it('rechaza una capitalización distinta del nombre autorizado', () => {
    const { origen, destino } = fixture(['app.js']);
    writeFileSync(join(origen, 'App.js'), 'app');
    expect(() => copiarManifiestoBackend({ raizOrigen: origen, raizDestino: destino })).toThrow(/capitalización/);
    expect(nombres(destino)).toEqual([]);
  });

  it('no sobrescribe un destino que ya existe', () => {
    const { origen, destino } = fixture();
    writeFileSync(join(destino, 'app.js'), 'previo');
    expect(() => copiarManifiestoBackend({ raizOrigen: origen, raizDestino: destino })).toThrow(/ya existe/);
    expect(readFileSync(join(destino, 'app.js'), 'utf8')).toBe('previo');
    expect(nombres(destino)).toEqual(['app.js']);
  });

  it('rechaza una raíz que no existe', () => {
    const { origen, destino } = fixture();
    expect(() => copiarManifiestoBackend({
      raizOrigen: join(origen, 'no-existe'),
      raizDestino: destino,
    })).toThrow(/no existe/);
    expect(() => copiarManifiestoBackend({
      raizOrigen: origen,
      raizDestino: join(destino, 'no-existe'),
    })).toThrow(/no existe/);
    expect(nombres(destino)).toEqual([]);
  });

  it('rechaza una ruta relativa con ..', () => {
    expect(() => segmentosRelativos('assets/../package.json')).toThrow(/sale de la raíz/);
    expect(() => segmentosRelativos('..\\app.js')).toThrow(/sale de la raíz/);
    expect(segmentosRelativos('assets\\branding\\logo-clinica-lopez.png')).toEqual([
      'assets',
      'branding',
      'logo-clinica-lopez.png',
    ]);
  });

  (enlaceArchivo ? it : it.skip)('rechaza un origen que es enlace simbólico', () => {
    const { origen, destino } = fixture(['app.js']);
    const fuera = join(origen, '..', 'fuera.js');
    writeFileSync(fuera, 'fuera');
    symlinkSync(fuera, join(origen, 'app.js'), 'file');
    expect(() => copiarManifiestoBackend({ raizOrigen: origen, raizDestino: destino })).toThrow(/enlace/);
    expect(nombres(destino)).toEqual([]);
  });

  (enlaceDirectorio ? it : it.skip)('rechaza un directorio intermedio que es enlace simbólico', () => {
    const { origen, destino } = fixture();
    rmSync(join(origen, 'dist'), { recursive: true, force: true });
    const real = join(origen, '..', 'dist-real');
    mkdirSync(join(real, 'apps', 'api'), { recursive: true });
    writeFileSync(join(real, 'apps', 'api', 'main.js'), 'main');
    symlinkSync(real, join(origen, 'dist'), 'dir');
    expect(() => copiarManifiestoBackend({ raizOrigen: origen, raizDestino: destino })).toThrow(/enlace/);
    expect(nombres(destino)).toEqual([]);
  });

  (enlaceArchivo ? it : it.skip)('rechaza un enlace que apunta fuera de la raíz', () => {
    const { origen, destino } = fixture(['package.json']);
    const fuera = join(origen, '..', 'package.json');
    writeFileSync(fuera, '{}');
    symlinkSync(fuera, join(origen, 'package.json'), 'file');
    expect(() => copiarManifiestoBackend({ raizOrigen: origen, raizDestino: destino })).toThrow(/enlace/);
    expect(nombres(destino)).toEqual([]);
  });

  (enlaceArchivo ? it : it.skip)('rechaza un destino que es enlace simbólico', () => {
    const { origen, destino } = fixture();
    const fuera = join(destino, '..', 'salida.js');
    writeFileSync(fuera, 'fuera');
    symlinkSync(fuera, join(destino, 'app.js'), 'file');
    expect(() => copiarManifiestoBackend({ raizOrigen: origen, raizDestino: destino })).toThrow(/enlace|ya existe/);
    expect(readFileSync(fuera, 'utf8')).toBe('fuera');
    expect(nombres(destino).filter((nombre) => nombre !== 'app.js')).toEqual([]);
  });

  (enlaceDirectorio ? it : it.skip)('no escribe el logo a través de un enlace fuera del destino', () => {
    const { origen, destino } = fixture();
    const fuera = join(destino, '..', 'marca-fuera');
    mkdirSync(fuera);
    symlinkSync(fuera, join(destino, 'assets'), 'dir');
    expect(() => copiarManifiestoBackend({ raizOrigen: origen, raizDestino: destino })).toThrow(/enlace/);
    expect(nombres(fuera)).toEqual([]);
  });
});

describe('disponibilidad de enlaces en este sistema', () => {
  it('informa si se pudieron crear enlaces de archivo y de directorio', () => {
    expect(typeof enlaceArchivo).toBe('boolean');
    expect(typeof enlaceDirectorio).toBe('boolean');
  });
});
