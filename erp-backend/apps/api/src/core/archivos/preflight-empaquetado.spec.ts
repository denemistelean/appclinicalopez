import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CORRESPONDENCIAS_BACKEND } from './copia-manifiesto';
import { preflightEmpaquetadoBackend } from './preflight-empaquetado';

const limpiezas: string[] = [];
const ORIGENES = CORRESPONDENCIAS_BACKEND.map((mapa) => mapa.origen);

afterEach(() => {
  for (const dir of limpiezas.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function baseTemporal(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cli-preflight-'));
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

function huella(dir: string): string[] {
  const lineas: string[] = [];
  const recorrer = (actual: string, prefijo: string) => {
    for (const nombre of readdirSync(actual).sort()) {
      const rel = prefijo ? `${prefijo}/${nombre}` : nombre;
      const ruta = join(actual, nombre);
      const estado = lstatSync(ruta);
      const tipo = estado.isSymbolicLink() ? 'l' : estado.isDirectory() ? 'd' : 'f';
      const cuerpo = estado.isSymbolicLink() || !estado.isFile() ? '' : readFileSync(ruta, 'utf8');
      lineas.push(`${tipo}:${rel}:${cuerpo}`);
      if (estado.isDirectory() && !estado.isSymbolicLink()) recorrer(ruta, rel);
    }
  };
  recorrer(dir, '');
  return lineas;
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

describe('preflight del empaquetado', () => {
  it('acepta los cinco orígenes sintéticos cuando el destino aún no tiene archivos', () => {
    const { origen, destino } = fixture();
    writeFileSync(join(origen, 'extra.txt'), 'no-entra');
    const antesOrigen = huella(origen);
    const antesDestino = huella(destino);
    const resultado = preflightEmpaquetadoBackend({ raizOrigen: origen, raizDestino: destino });
    expect(resultado.ok).toBe(true);
    expect(resultado.diagnosticos).toEqual([]);
    expect(resultado.carpetasPendientes).toEqual(['assets', 'assets/branding']);
    expect(resultado.correspondencias).toEqual([
      { origen: 'app.js', destino: 'app.js' },
      { origen: 'dist/apps/api/main.js', destino: 'main.js' },
      { origen: 'package.json', destino: 'package.json' },
      { origen: 'package-lock.json', destino: 'package-lock.json' },
      { origen: 'assets/branding/logo-clinica-lopez.png', destino: 'assets/branding/logo-clinica-lopez.png' },
    ]);
    expect(huella(origen)).toEqual(antesOrigen);
    expect(huella(destino)).toEqual(antesDestino);
    expect(existsSync(join(destino, 'assets'))).toBe(false);
    expect(existsSync(join(destino, 'main.js'))).toBe(false);
  });

  it.each(ORIGENES)('falla si falta el origen %s y no toca el destino', (relativo) => {
    const { origen, destino } = fixture([relativo]);
    const antesOrigen = huella(origen);
    const antesDestino = huella(destino);
    const resultado = preflightEmpaquetadoBackend({ raizOrigen: origen, raizDestino: destino });
    expect(resultado.ok).toBe(false);
    expect(resultado.diagnosticos).toEqual(expect.arrayContaining([
      expect.objectContaining({ comprobacion: 'archivo-ausente', rutaRelativa: relativo, ambito: 'origen' }),
    ]));
    expect(huella(origen)).toEqual(antesOrigen);
    expect(huella(destino)).toEqual(antesDestino);
  });

  it('falla si un destino ya existe y conserva ese archivo', () => {
    const { origen, destino } = fixture();
    writeFileSync(join(destino, 'app.js'), 'previo');
    const antes = huella(destino);
    const resultado = preflightEmpaquetadoBackend({ raizOrigen: origen, raizDestino: destino });
    expect(resultado.ok).toBe(false);
    expect(resultado.diagnosticos).toEqual(expect.arrayContaining([
      expect.objectContaining({ comprobacion: 'destino-existente', rutaRelativa: 'app.js', ambito: 'destino' }),
    ]));
    expect(huella(destino)).toEqual(antes);
    expect(readFileSync(join(destino, 'app.js'), 'utf8')).toBe('previo');
  });

  it('rechaza una capitalización distinta', () => {
    const { origen, destino } = fixture(['app.js']);
    writeFileSync(join(origen, 'App.js'), 'app');
    const resultado = preflightEmpaquetadoBackend({ raizOrigen: origen, raizDestino: destino });
    expect(resultado.ok).toBe(false);
    expect(resultado.diagnosticos).toEqual(expect.arrayContaining([
      expect.objectContaining({ comprobacion: 'capitalizacion', rutaRelativa: 'app.js', ambito: 'origen' }),
    ]));
  });

  it('informa raíces inexistentes y no las crea', () => {
    const base = baseTemporal();
    const origen = join(base, 'sin-origen');
    const destino = join(base, 'sin-destino');
    const resultado = preflightEmpaquetadoBackend({ raizOrigen: origen, raizDestino: destino });
    expect(resultado.ok).toBe(false);
    expect(resultado.diagnosticos).toEqual(expect.arrayContaining([
      expect.objectContaining({ comprobacion: 'raiz-inexistente', ambito: 'origen' }),
      expect.objectContaining({ comprobacion: 'raiz-inexistente', ambito: 'destino' }),
    ]));
    expect(existsSync(origen)).toBe(false);
    expect(existsSync(destino)).toBe(false);
  });

  it('rechaza una entrada adicional y un sustituto de main.js o del logo', () => {
    const { origen, destino } = fixture();
    const resultado = preflightEmpaquetadoBackend({
      raizOrigen: origen,
      raizDestino: destino,
      entradas: [
        ...CORRESPONDENCIAS_BACKEND.filter((mapa) => mapa.destino !== 'main.js'),
        { origen: 'main.js', destino: 'main.js' },
        { origen: 'otro-logo.png', destino: 'assets/branding/logo-clinica-lopez.png' },
        { origen: 'notas.txt', destino: 'notas.txt' },
        { origen: '../secreto', destino: '../secreto' },
      ],
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.diagnosticos).toEqual(expect.arrayContaining([
      expect.objectContaining({ comprobacion: 'ruta-omitida', rutaRelativa: 'main.js', ambito: 'manifiesto' }),
      expect.objectContaining({ comprobacion: 'ruta-no-autorizada', rutaRelativa: 'main.js', ambito: 'manifiesto' }),
      expect.objectContaining({
        comprobacion: 'ruta-no-autorizada',
        rutaRelativa: 'assets/branding/logo-clinica-lopez.png',
        ambito: 'manifiesto',
      }),
      expect.objectContaining({ comprobacion: 'ruta-no-autorizada', rutaRelativa: 'notas.txt', ambito: 'manifiesto' }),
      expect.objectContaining({ comprobacion: 'ruta-no-autorizada', rutaRelativa: '../secreto', ambito: 'manifiesto' }),
    ]));
    expect(resultado.correspondencias).toHaveLength(5);
    expect(existsSync(join(destino, 'notas.txt'))).toBe(false);
  });

  (enlaceArchivo ? it : it.skip)('rechaza un origen que es enlace simbólico', () => {
    const { origen, destino } = fixture(['app.js']);
    const fuera = join(origen, '..', 'fuera.js');
    writeFileSync(fuera, 'fuera');
    symlinkSync(fuera, join(origen, 'app.js'), 'file');
    const resultado = preflightEmpaquetadoBackend({ raizOrigen: origen, raizDestino: destino });
    expect(resultado.ok).toBe(false);
    expect(resultado.diagnosticos).toEqual(expect.arrayContaining([
      expect.objectContaining({ comprobacion: 'enlace-simbolico', rutaRelativa: 'app.js', ambito: 'origen' }),
    ]));
    expect(readFileSync(fuera, 'utf8')).toBe('fuera');
    expect(huella(destino)).toEqual([]);
  });

  (enlaceDirectorio ? it : it.skip)('rechaza un directorio intermedio de origen que es enlace', () => {
    const { origen, destino } = fixture();
    rmSync(join(origen, 'dist'), { recursive: true, force: true });
    const real = join(origen, '..', 'dist-real');
    mkdirSync(join(real, 'apps', 'api'), { recursive: true });
    writeFileSync(join(real, 'apps', 'api', 'main.js'), 'main');
    symlinkSync(real, join(origen, 'dist'), 'dir');
    const resultado = preflightEmpaquetadoBackend({ raizOrigen: origen, raizDestino: destino });
    expect(resultado.ok).toBe(false);
    expect(resultado.diagnosticos).toEqual(expect.arrayContaining([
      expect.objectContaining({
        comprobacion: 'enlace-simbolico',
        rutaRelativa: 'dist/apps/api/main.js',
        ambito: 'origen',
      }),
    ]));
    expect(huella(destino)).toEqual([]);
  });

  (enlaceArchivo ? it : it.skip)('rechaza un destino que es enlace simbólico', () => {
    const { origen, destino } = fixture();
    const fuera = join(destino, '..', 'salida.js');
    writeFileSync(fuera, 'fuera');
    symlinkSync(fuera, join(destino, 'app.js'), 'file');
    const resultado = preflightEmpaquetadoBackend({ raizOrigen: origen, raizDestino: destino });
    expect(resultado.ok).toBe(false);
    expect(resultado.diagnosticos).toEqual(expect.arrayContaining([
      expect.objectContaining({ comprobacion: 'enlace-simbolico', rutaRelativa: 'app.js', ambito: 'destino' }),
    ]));
    expect(readFileSync(fuera, 'utf8')).toBe('fuera');
  });

  (enlaceDirectorio ? it : it.skip)('rechaza una raíz de destino que es un enlace hacia otro directorio', () => {
    const { origen, destino } = fixture();
    const enlace = join(destino, '..', 'destino-enlace');
    symlinkSync(destino, enlace, 'dir');
    const resultado = preflightEmpaquetadoBackend({ raizOrigen: origen, raizDestino: enlace });
    expect(resultado.ok).toBe(false);
    expect(resultado.diagnosticos).toEqual(expect.arrayContaining([
      expect.objectContaining({ comprobacion: 'raiz-enlace', ambito: 'destino' }),
    ]));
    expect(huella(destino)).not.toContain('f:app.js:app');
    expect(existsSync(join(destino, 'assets'))).toBe(false);
  });
});

describe('disponibilidad de enlaces para el preflight', () => {
  it('informa si este proceso pudo crear enlaces de archivo y de directorio', () => {
    expect(enlaceArchivo).toEqual(expect.any(Boolean));
    expect(enlaceDirectorio).toEqual(expect.any(Boolean));
  });
});
