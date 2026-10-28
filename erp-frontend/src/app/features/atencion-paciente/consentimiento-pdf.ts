import jsPDF from 'jspdf';
import { BloqueConsentimiento } from './consentimientos-lopez';

const FIRMA_MEDICO = {
  nombre: 'Dra. Soraya López',
  especialidad: 'Cirugía Plástica',
  credenciales: 'CMP 41034 · RNE 19238',
};

const LOGO = 'assets/images/logo-clinica-lopez.png';

export async function abrirConsentimientoPdf(opts: {
  bloques: BloqueConsentimiento[];
  paciente: string;
  documento: string;
}): Promise<void> {
  const logo = await cargarLogo();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 16;
  const ancho = pageW - marginX * 2;
  const contenidoHasta = pageH - 16;
  let y = 0;

  const nueva = () => {
    if (y !== 0) pdf.addPage();
    dibujarCabecera(pdf, logo, pageW);
    y = 40;
  };

  nueva();
  for (const bloque of opts.bloques) {
    if (esPieDelWord(bloque.texto)) continue;
    const tam = bloque.titulo ? 11 : 10;
    const estilo = bloque.titulo ? 'bold' : 'normal';
    pdf.setFont('helvetica', estilo);
    pdf.setFontSize(tam);
    const lineas: string[] = pdf.splitTextToSize(bloque.texto, ancho);
    const lh = tam * 0.42;
    if (bloque.titulo) y += 1.4;
    for (const linea of lineas) {
      if (y + lh > contenidoHasta) {
        nueva();
        pdf.setFont('helvetica', estilo);
        pdf.setFontSize(tam);
      }
      pdf.setTextColor(28, 38, 32);
      pdf.text(linea, marginX, y);
      y += lh;
    }
    y += bloque.titulo ? 1.2 : 1.6;
  }

  const espacio = 5 * 4.6;
  const altoFirmas = 22;
  if (y + espacio + altoFirmas > contenidoHasta) nueva();
  y += espacio;
  dibujarFirmas(pdf, y, pageW, opts.paciente, opts.documento);

  const total = pdf.getNumberOfPages();
  const generado = `Fecha de Generación de Documento: ${fechaHoy()}`;
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(55, 64, 60);
    pdf.text(generado, marginX, pageH - 6);
    pdf.text(`Página ${i} de ${total}`, pageW - marginX, pageH - 6, { align: 'right' });
  }

  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const ventana = window.open(url, '_blank');
  if (!ventana) pdf.save('consentimiento.pdf');
}

function fechaHoy(): string {
  const ahora = new Date();
  const dd = String(ahora.getDate()).padStart(2, '0');
  const mm = String(ahora.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${ahora.getFullYear()}`;
}

function dibujarCabecera(pdf: jsPDF, logo: string | null, pageW: number) {
  if (logo) {
    const ancho = 52;
    const alto = ancho * (433 / 960);
    pdf.addImage(logo, 'PNG', (pageW - ancho) / 2, 8, ancho, alto);
  } else {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(28, 38, 32);
    pdf.text('CIRUGÍA PLÁSTICA LÓPEZ', pageW / 2, 16, { align: 'center' });
  }
  pdf.setDrawColor(13, 148, 136);
  pdf.setLineWidth(0.4);
  pdf.line(16, 36, pageW - 16, 36);
}

function dibujarFirmas(pdf: jsPDF, y: number, pageW: number, paciente: string, documento: string) {
  const izquierda = { x1: 22, x2: pageW / 2 - 16 };
  const derecha = { x1: pageW / 2 + 16, x2: pageW - 22 };
  const cxIzq = (izquierda.x1 + izquierda.x2) / 2;
  const cxDer = (derecha.x1 + derecha.x2) / 2;

  pdf.setDrawColor(40, 48, 44);
  pdf.setLineWidth(0.35);
  pdf.line(izquierda.x1, y, izquierda.x2, y);
  pdf.line(derecha.x1, y, derecha.x2, y);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(28, 38, 32);
  pdf.text(paciente || 'Paciente', cxIzq, y + 6, { align: 'center', maxWidth: izquierda.x2 - izquierda.x1 });
  pdf.text(FIRMA_MEDICO.nombre, cxDer, y + 6, { align: 'center' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(70, 78, 74);
  pdf.text(documento || 'DNI -', cxIzq, y + 11, { align: 'center' });
  pdf.text(FIRMA_MEDICO.especialidad, cxDer, y + 11, { align: 'center' });
  pdf.text(FIRMA_MEDICO.credenciales, cxDer, y + 15.5, { align: 'center' });
}

function esPieDelWord(texto: string): boolean {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (/^[_\.\-·\s]+$/.test(limpio)) return true;
  if (/^firma del paciente/i.test(limpio)) return true;
  if (/^dni\b/i.test(limpio)) return true;
  return false;
}

function cargarLogo(): Promise<string | null> {
  return fetch(LOGO)
    .then((res) => (res.ok ? res.blob() : null))
    .then(
      (blob) =>
        new Promise<string | null>((resolve) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || '') || null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        }),
    )
    .catch(() => null);
}
