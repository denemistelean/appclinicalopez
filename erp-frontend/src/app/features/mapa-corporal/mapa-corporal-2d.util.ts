import { ZONAS_ANATOMICAS } from './mapa-corporal.zones';

export type Vista2d = 'front' | 'back';

export type Proyeccion2d = {
  vista_2d: Vista2d;
  pos_2d_x: number;
  pos_2d_y: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Proyecta un punto 3D del modelo centrado a coordenadas % sobre la silueta del informe.
 * modelSize = tamaño del bbox del GLB (tras centrar el modelo en origen).
 */
export function proyectarPunto3dA2d(
  pos: { x: number; y: number; z: number },
  modelSize: { x: number; y: number; z: number },
  opts?: { lado?: string; zonaCodigo?: string },
): Proyeccion2d {
  const zona = opts?.zonaCodigo
    ? ZONAS_ANATOMICAS.find((z) => z.id === opts.zonaCodigo)
    : undefined;

  if (zona) {
    return {
      vista_2d: zona.side,
      pos_2d_x: clamp(50 + zona.xFrac * 42, 0, 100),
      pos_2d_y: clamp((1 - zona.yFrac) * 92 + 4, 0, 100),
    };
  }

  const lado = String(opts?.lado || '').toLowerCase();
  let vista: Vista2d = 'front';
  if (lado.includes('post')) vista = 'back';
  else if (lado.includes('front')) vista = 'front';
  else vista = Number(pos.z) >= 0 ? 'front' : 'back';

  const halfX = Math.max(Number(modelSize.x) / 2, 0.0001);
  const height = Math.max(Number(modelSize.y), 0.0001);
  const bottomY = -height / 2;
  const yFrac = (Number(pos.y) - bottomY) / height;
  const xWorld = vista === 'back' ? -Number(pos.x) : Number(pos.x);
  const xFrac = xWorld / halfX;

  return {
    vista_2d: vista,
    pos_2d_x: clamp(50 + clamp(xFrac, -1.2, 1.2) * 42, 0, 100),
    pos_2d_y: clamp((1 - clamp(yFrac, 0, 1)) * 92 + 4, 0, 100),
  };
}

export function tieneCoords2d(m: any): boolean {
  if (!m) return false;
  const x = Number(m.pos_2d_x);
  const y = Number(m.pos_2d_y);
  const v = String(m.vista_2d || '');
  return (v === 'front' || v === 'back') && Number.isFinite(x) && Number.isFinite(y);
}
