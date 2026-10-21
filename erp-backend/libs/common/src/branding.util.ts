import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Firma institucional para pie de PDFs clínicos */
export const FIRMA_DRA = {
  nombre: 'Dra. Soraya Lopez',
  especialidad: 'Cirugia Plastica',
  credenciales: 'CMP 41034 · RNE 19238',
};

const LOGO_CANDIDATES = [
  join(process.cwd(), 'assets', 'branding', 'logo-clinica-lopez.png'),
  join(process.cwd(), 'erp-backend', 'assets', 'branding', 'logo-clinica-lopez.png'),
  join(__dirname, '..', '..', '..', 'assets', 'branding', 'logo-clinica-lopez.png'),
];

let cachedLogoDataUri: string | null | undefined;

/** Data URI del logo institucional (cacheado). */
export function logoClinicaDataUri(): string | null {
  if (cachedLogoDataUri !== undefined) return cachedLogoDataUri;
  for (const p of LOGO_CANDIDATES) {
    try {
      if (!existsSync(p)) continue;
      const buf = readFileSync(p);
      cachedLogoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
      return cachedLogoDataUri;
    } catch {
      /* siguiente candidata */
    }
  }
  cachedLogoDataUri = null;
  return null;
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
