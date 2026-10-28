import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { NOMBRE_PAQUETE, resolverUploadsRoot } from './uploads-root';

describe('raíz pública de uploads', () => {
  const temporales: string[] = [];

  afterEach(() => {
    for (const dir of temporales.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function raizSintetica(): string {
    const raiz = mkdtempSync(join(tmpdir(), 'cli-uploads-'));
    temporales.push(raiz);
    writeFileSync(join(raiz, 'package.json'), JSON.stringify({ name: NOMBRE_PAQUETE }));
    return raiz;
  }

  it('desde el árbol fuente, desde dist y junto a app.js apunta a la misma carpeta', () => {
    const raiz = raizSintetica();
    const fuente = join(raiz, 'apps', 'api', 'src');
    const bundle = join(raiz, 'dist', 'apps', 'api');
    mkdirSync(fuente, { recursive: true });
    mkdirSync(bundle, { recursive: true });
    writeFileSync(join(raiz, 'app.js'), '// sintetico');
    writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'otro-paquete' }));

    const esperada = join(raiz, 'uploads');
    expect(resolverUploadsRoot(fuente)).toBe(esperada);
    expect(resolverUploadsRoot(bundle)).toBe(esperada);
    expect(resolverUploadsRoot(raiz)).toBe(esperada);
  });

  it('no apunta a la carpeta de expedientes', () => {
    const raiz = raizSintetica();
    const resuelta = resolverUploadsRoot(raiz);
    expect(resuelta).toBe(join(raiz, 'uploads'));
    expect(resuelta.includes('ClinicaDigital')).toBe(false);
  });
});
