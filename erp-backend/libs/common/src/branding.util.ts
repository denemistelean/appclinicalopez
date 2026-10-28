import { lstatSync, readFileSync } from 'fs';
import { isAbsolute, join, relative } from 'path';
import { buscarRaizAplicacion } from './uploads-root';

/** Firma institucional para pie de PDFs clínicos */
export const FIRMA_DRA = {
  nombre: 'Dra. Soraya López',
  especialidad: 'Cirugía Plástica',
  credenciales: 'CMP 41034 · RNE 19238',
};

/**
 * Logo dentro de la raíz Node identificada por package.json.
 * No usa el directorio de trabajo ni sube una cantidad fija de niveles:
 * con main.js junto a app.js, tres `..` saldrían de esa raíz.
 */
export function rutaLogoClinica(directorioModulo: string): string | null {
  let raiz: string;
  try {
    raiz = buscarRaizAplicacion(directorioModulo);
  } catch {
    return null;
  }
  const ruta = join(raiz, 'assets', 'branding', 'logo-clinica-lopez.png');
  const rel = relative(raiz, ruta);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  try {
    const estado = lstatSync(ruta);
    if (estado.isSymbolicLink() || !estado.isFile()) return null;
  } catch {
    return null;
  }
  return ruta;
}

let cachedLogoDataUri: string | null | undefined;

/** Data URI del logo institucional (cacheado). */
export function logoClinicaDataUri(): string | null {
  if (cachedLogoDataUri !== undefined) return cachedLogoDataUri;
  const ruta = rutaLogoClinica(__dirname);
  if (!ruta) {
    cachedLogoDataUri = null;
    return null;
  }
  try {
    const buf = readFileSync(ruta);
    cachedLogoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
    return cachedLogoDataUri;
  } catch {
    cachedLogoDataUri = null;
    return null;
  }
}

/** Bloque HTML de cabecera con logo (para documentos clínicos). */
export function htmlLogoHeader(opts?: { titulo?: string; subtitulo?: string }): string {
  const logo = logoClinicaDataUri();
  const titulo = opts?.titulo || '';
  const sub = opts?.subtitulo || 'Consulta ambulatoria';
  const img = logo
    ? `<img src="${logo}" alt="Cirugía Plástica López" style="height:108px;width:auto;max-width:340px;display:block;margin:0 auto 8px" />`
    : `<div style="text-align:center;font-family:Georgia,serif;font-size:16px;font-weight:700;letter-spacing:.04em;color:#1c2620;margin-bottom:6px">
         CIRUGÍA PLÁSTICA LÓPEZ
       </div>
       <div style="text-align:center;font-size:11px;color:#6b756e;margin-bottom:10px">Clínica Especializada &amp; Medical Spa</div>`;
  return `
    <div class="doc-brand" style="text-align:center;margin-bottom:14px;padding-bottom:12px;border-bottom:2px solid #0d9488">
      ${img}
      ${titulo ? `<div style="font-size:16px;font-weight:700;color:#1c2620;margin-top:4px">${titulo}</div>` : ''}
      ${sub ? `<div style="font-size:11px;color:#6b756e;margin-top:2px">${sub}</div>` : ''}
    </div>`;
}

/** Pie de página con línea de firma de la Dra. */
export function htmlFirmaPie(): string {
  const { nombre, especialidad, credenciales } = FIRMA_DRA;
  return `
    <div class="doc-firma" style="margin-top:48px;padding-top:8px;text-align:center;page-break-inside:avoid">
      <div style="width:220px;margin:0 auto 10px;border-top:1px solid #b8beb8"></div>
      <div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;font-weight:700;color:#1c2620">${nombre}</div>
      <div style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#6b756e;margin-top:2px">${especialidad}</div>
      <div style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#6b756e;margin-top:2px">${credenciales}</div>
    </div>`;
}
