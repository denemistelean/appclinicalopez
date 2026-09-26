import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { AlertService } from 'src/app/core/services/ui/alert.service';
import { ReportesService } from '../reportes/reportes.service';
import { MapaCorporalService } from '../mapa-corporal/mapa-corporal.service';
import { ZONAS_ANATOMICAS } from '../mapa-corporal/mapa-corporal.zones';
import { proyectarPunto3dA2d, tieneCoords2d } from '../mapa-corporal/mapa-corporal-2d.util';

const SKIP_KEYS = new Set([
  'id_paciente',
  'id_usuario_crea',
  'id_usuario_mod',
  'estado_registro',
  'id_paciente_fusionado',
  'id_sede_registro',
  'id_consulta',
  'id_cita',
  'id_personal',
  'id_sede',
  'id_tratamiento',
  'id_tipo_cita',
  'id_plantilla_clinica',
  'id_consulta_plan',
  'id_paciente_paquete',
  'id_paquete',
  'id_mapa_marcador',
  'id_documento',
  'id_documento_paciente',
  'id_cie10',
  'id_cie10_subcategoria',
  'id_medicamento',
  'id_sala',
  'id_equipo',
  'pos_x',
  'pos_y',
  'pos_z',
  'origen',
  'examen_json',
  'datos_plantilla_json',
  'adjuntos_json',
]);

const LABELS: Record<string, string> = {
  tipo_documento: 'Tipo documento',
  numero_documento: 'N° documento',
  nombres: 'Nombres',
  apellidos: 'Apellidos',
  fecha_nacimiento: 'Fecha de nacimiento',
  sexo: 'Sexo',
  estado_civil: 'Estado civil',
  telefono: 'Teléfono',
  telefono_alterno: 'Teléfono alterno',
  email: 'Email',
  direccion: 'Dirección',
  distrito: 'Distrito',
  ciudad: 'Ciudad',
  ocupacion: 'Ocupación',
  contacto_emergencia_nombre: 'Contacto emergencia',
  contacto_emergencia_telefono: 'Tel. emergencia',
  observaciones: 'Observaciones',
  estado: 'Estado',
  sede_nombre: 'Sede de registro',
  fecha_medida: 'Fecha',
  peso_kg: 'Peso (kg)',
  talla_cm: 'Talla (cm)',
  imc: 'IMC',
  porcentaje_grasa: '% grasa',
  circunferencia_cintura: 'Cintura (cm)',
  fecha_registro: 'Fecha',
  presion_sistolica: 'PA sistólica',
  presion_diastolica: 'PA diastólica',
  frecuencia_cardiaca: 'FC',
  frecuencia_respiratoria: 'FR',
  temperatura_c: 'Temperatura (°C)',
  saturacion_o2: 'Sat. O₂',
  nombre_vacuna: 'Vacuna',
  dosis: 'Dosis',
  fecha_aplicacion: 'Fecha aplicación',
  proxima_dosis: 'Próxima dosis',
  lote: 'Lote',
  diagnostico: 'Diagnóstico',
  codigo_cie10: 'CIE-10',
  fecha_diagnostico: 'Fecha diagnóstico',
  activo: 'Activo',
  tipo: 'Tipo',
  descripcion: 'Descripción',
  procedimiento: 'Procedimiento',
  fecha_cirugia: 'Fecha cirugía',
  institucion: 'Institución',
  parentesco: 'Parentesco',
  sustancia: 'Sustancia',
  reaccion: 'Reacción',
  severidad: 'Severidad',
  activa: 'Activa',
  medicamento: 'Medicamento',
  frecuencia: 'Frecuencia',
  via: 'Vía',
  fecha_inicio: 'Inicio',
  fecha_fin: 'Fin',
  menarquia_edad: 'Menarquia (edad)',
  fur: 'FUR',
  ciclo_dias: 'Ciclo (días)',
  gestaciones: 'Gestaciones',
  partos: 'Partos',
  cesareas: 'Cesáreas',
  abortos: 'Abortos',
  metodo_anticonceptivo: 'Método anticonceptivo',
  fum: 'FUM',
  fpp: 'FPP',
  semanas_gestacion: 'Semanas gestación',
  estado_embarazo: 'Estado embarazo',
  resultado: 'Resultado',
  fecha_cita: 'Fecha',
  hora_inicio: 'Hora inicio',
  hora_fin: 'Hora fin',
  tratamiento: 'Tratamiento',
  tipo_cita: 'Tipo de cita',
  personal: 'Personal',
  sede: 'Sede',
  motivo: 'Motivo',
  notas: 'Notas',
  fecha_consulta: 'Fecha consulta',
  motivo_consulta: 'Motivo',
  tiempo_enfermedad: 'Tiempo enfermedad',
  tipo_enfermedad: 'Tipo enfermedad',
  relato: 'Relato',
  anamnesis: 'Anamnesis',
  examen_fisico: 'Examen físico',
  apreciacion: 'Apreciación',
  plantilla: 'Plantilla',
  indicaciones_generales: 'Indicaciones',
  zona_label: 'Zona',
  zona_codigo: 'Código zona',
  lado: 'Lado',
  fecha_plan: 'Fecha',
  titulo: 'Título',
  nombre_original: 'Archivo',
  tipo_nombre: 'Tipo',
  fecha_documento: 'Fecha',
  tamano_bytes: 'Tamaño',
  mime_type: 'MIME',
  codigo: 'Código',
  nombre: 'Nombre',
  categoria: 'Categoría',
  duracion_minutos: 'Duración (min)',
  precio_base: 'Precio base',
  especialidad: 'Especialidad',
  paquete_nombre: 'Paquete',
  fecha_compra: 'Fecha compra',
  sesiones_total: 'Sesiones',
  precio_pagado: 'Precio pagado',
};

const HIST_SECCIONES: { key: string; titulo: string }[] = [
  { key: 'medidas', titulo: 'Medidas corporales' },
  { key: 'vitales', titulo: 'Funciones vitales' },
  { key: 'vacunas', titulo: 'Vacunas' },
  { key: 'antecedentes_patologicos', titulo: 'Antecedentes patológicos' },
  { key: 'antecedentes_personales', titulo: 'Antecedentes personales' },
  { key: 'antecedentes_quirurgicos', titulo: 'Antecedentes quirúrgicos' },
  { key: 'antecedentes_familiares', titulo: 'Antecedentes familiares' },
  { key: 'alergias', titulo: 'Alergias y RAMs' },
  { key: 'medicaciones', titulo: 'Medicación habitual' },
  { key: 'gineco_obstetricos', titulo: 'Antecedentes gineco-obstétricos' },
  { key: 'embarazos', titulo: 'Embarazos' },
];

@Component({
  selector: 'app-paciente-informe',
  standalone: true,
  imports: [CommonModule, RouterModule, DatePipe],
  templateUrl: './paciente-informe.component.html',
  styleUrl: './paciente-informe.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe],
})
export class PacienteInformeComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private reportes = inject(ReportesService);
  private mapaService = inject(MapaCorporalService);
  private alert = inject(AlertService);
  private datePipe = inject(DatePipe);

  @ViewChild('hojaPdf') hojaPdf?: ElementRef<HTMLElement>;

  idPaciente = signal(0);
  loading = signal(true);
  exporting = signal(false);
  informe = signal<any>(null);
  error = signal('');
  capturaFrontalUrl = signal<string | null>(null);
  capturaPosteriorUrl = signal<string | null>(null);
  tieneCapturas3d = signal(false);

  histSecciones = HIST_SECCIONES;
  zonas = ZONAS_ANATOMICAS;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.idPaciente.set(id);
    if (!id) {
      this.error.set('Paciente no válido');
      this.loading.set(false);
      return;
    }
    this.alert.showLoading('Generando informe...');
    this.reportes.getInformePaciente(id).subscribe({
      next: (res: any) => {
        this.alert.closeLoading();
        this.informe.set(res?.data ?? res);
        this.loading.set(false);
        this.cargarCapturas3d(id);
      },
      error: (err) => {
        this.alert.closeLoading();
        this.error.set(err?.error?.message || 'No se pudo cargar el informe');
        this.loading.set(false);
      },
    });
  }

  private cargarCapturas3d(id: number) {
    this.mapaService.estadoCapturas(id).subscribe({
      next: (res: any) => {
        const est = res?.data ?? res;
        const ok = !!(est?.frontal || est?.posterior);
        this.tieneCapturas3d.set(ok);
        if (est?.frontal) this.loadCapturaBlob(id, 'frontal', this.capturaFrontalUrl);
        if (est?.posterior) this.loadCapturaBlob(id, 'posterior', this.capturaPosteriorUrl);
      },
      error: () => this.tieneCapturas3d.set(false),
    });
  }

  private loadCapturaBlob(
    id: number,
    vista: 'frontal' | 'posterior',
    target: ReturnType<typeof signal<string | null>>,
  ) {
    this.mapaService.getCapturaBlob(id, vista).subscribe({
      next: (blob) => {
        const prev = target();
        if (prev) URL.revokeObjectURL(prev);
        target.set(URL.createObjectURL(blob));
      },
      error: () => target.set(null),
    });
  }

  isEmpty(v: unknown): boolean {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (typeof v === 'number') return Number.isNaN(v);
    if (typeof v === 'boolean') return false;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') {
      return Object.values(v as object).every((x) => this.isEmpty(x));
    }
    return false;
  }

  labelOf(key: string): string {
    return LABELS[key] || key.replace(/_/g, ' ');
  }

  formatValue(key: string, v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'boolean' || v === 0 || v === 1) {
      if (key === 'activo' || key === 'activa') return v ? 'Sí' : 'No';
    }
    if (typeof v === 'number' && key === 'tamano_bytes') {
      if (v < 1024) return `${v} B`;
      if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
      return `${(v / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const d = this.datePipe.transform(v, 'dd/MM/yyyy HH:mm');
      if (v.length <= 10) return this.datePipe.transform(v, 'dd/MM/yyyy') || v;
      return d || v;
    }
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  fieldsOf(row: Record<string, any> | null | undefined): { key: string; label: string; value: string }[] {
    if (!row || typeof row !== 'object') return [];
    return Object.entries(row)
      .filter(([k, v]) => {
        if (SKIP_KEYS.has(k) || k.startsWith('id_')) return false;
        if (Array.isArray(v)) return false;
        if (v != null && typeof v === 'object') return false;
        return !this.isEmpty(v);
      })
      .map(([k, v]) => ({ key: k, label: this.labelOf(k), value: this.formatValue(k, v) }));
  }

  hasSection(rows: any[] | null | undefined): boolean {
    if (!rows?.length) return false;
    return rows.some((r) => this.fieldsOf(r).length > 0);
  }

  histRows(key: string): any[] {
    return this.informe()?.historia_paciente?.[key] || [];
  }

  tieneHistoriaPaciente(): boolean {
    return this.histSecciones.some((s) => this.hasSection(this.histRows(s.key)));
  }

  /** Todos los marcadores del mapa, numerados, con posición 2D para el informe. */
  marcadoresInforme(): {
    n: number;
    procedimiento: string;
    estado: string;
    notas: string;
    fecha: string;
    side: 'front' | 'back';
    left: string;
    top: string;
    color: string;
    row: any;
  }[] {
    const mapa: any[] = this.informe()?.mapa_corporal || [];
    if (!mapa.length) return [];

    // Fallback 3D solo para registros antiguos sin vista_2d
    const sin2d = mapa.filter((m) => !tieneCoords2d(m));
    const coords = sin2d
      .map((m) => ({ x: Number(m.pos_x), y: Number(m.pos_y) }))
      .filter((c) => !Number.isNaN(c.x) && !Number.isNaN(c.y));
    const xs = coords.map((c) => c.x);
    const ys = coords.map((c) => c.y);
    let yMin = ys.length ? Math.min(...ys) : -1;
    let yMax = ys.length ? Math.max(...ys) : 1;
    let xSpan = xs.length ? Math.max(...xs.map(Math.abs), 0.2) : 0.35;
    const yPad = Math.max((yMax - yMin) * 0.35, 0.25);
    yMin -= yPad;
    yMax += yPad;
    xSpan = Math.max(xSpan * 1.25, 0.25);

    return mapa.map((m, idx) => {
      const n = idx + 1;
      let side: 'front' | 'back' = 'front';
      let leftPct: number;
      let topPct: number;

      if (tieneCoords2d(m)) {
        side = m.vista_2d === 'back' ? 'back' : 'front';
        leftPct = Number(m.pos_2d_x);
        topPct = Number(m.pos_2d_y);
      } else {
        const zona = this.zonas.find((z) => z.id === m.zona_codigo);
        if (zona) {
          const p = proyectarPunto3dA2d(
            { x: Number(m.pos_x) || 0, y: Number(m.pos_y) || 0, z: Number(m.pos_z) || 0 },
            { x: 1, y: 1, z: 1 },
            { lado: m.lado, zonaCodigo: m.zona_codigo },
          );
          side = p.vista_2d;
          leftPct = p.pos_2d_x;
          topPct = p.pos_2d_y;
        } else {
          side = this.resolverLado(m, zona);
          const px = Number(m.pos_x);
          const py = Number(m.pos_y);
          const x = Number.isNaN(px) ? 0 : px;
          const y = Number.isNaN(py) ? (yMin + yMax) / 2 : py;
          const xSigned = side === 'back' ? -x : x;
          leftPct = 50 + (xSigned / xSpan) * 40;
          topPct = ((yMax - y) / (yMax - yMin || 1)) * 88 + 6;
        }
      }

      return {
        n,
        procedimiento: String(m.procedimiento || '').trim(),
        estado: String(m.estado || '').trim(),
        notas: String(m.notas || '').trim(),
        fecha: m.fecha_plan ? this.formatValue('fecha_plan', m.fecha_plan) : '',
        side,
        left: `${Math.min(94, Math.max(6, leftPct))}%`,
        top: `${Math.min(94, Math.max(6, topPct))}%`,
        color: this.colorEstado(m.estado),
        row: m,
      };
    });
  }

  marcadoresEnVista(side: 'front' | 'back') {
    return this.marcadoresInforme().filter((m) => m.side === side);
  }

  fieldsOfMarcador(row: Record<string, any> | null | undefined) {
    const hide = new Set([
      'zona_codigo',
      'zona_label',
      'lado',
      'origen',
      'pos_x',
      'pos_y',
      'pos_z',
      'vista_2d',
      'pos_2d_x',
      'pos_2d_y',
    ]);
    return this.fieldsOf(row).filter((f) => !hide.has(f.key));
  }

  colorEstado(estado: string): string {
    switch (String(estado || '').toUpperCase()) {
      case 'REALIZADO':
        return '#c0392b';
      case 'SEGUIMIENTO':
        return '#2563eb';
      case 'PLANIFICADO':
        return '#d97706';
      default:
        return '#64748b';
    }
  }

  private resolverLado(m: any, zona?: { side: 'front' | 'back' }): 'front' | 'back' {
    if (zona) return zona.side;
    const lado = String(m.lado || '').toLowerCase();
    if (lado.includes('post')) return 'back';
    if (lado.includes('front') || lado.includes('fronta')) return 'front';
    const pz = Number(m.pos_z);
    if (!Number.isNaN(pz)) return pz >= 0 ? 'front' : 'back';
    return 'front';
  }

  nombreCompleto(): string {
    const p = this.informe()?.paciente;
    if (!p) return '';
    return `${p.nombres || ''} ${p.apellidos || ''}`.trim();
  }

  async exportarPdf(): Promise<void> {
    const el = this.hojaPdf?.nativeElement;
    if (!el) return;
    this.exporting.set(true);
    this.alert.showLoading('Exportando PDF...');
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: el.scrollWidth,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const contentW = pageW - margin * 2;
      const imgH = (canvas.height * contentW) / canvas.width;
      let heightLeft = imgH;
      let position = margin;

      pdf.addImage(imgData, 'JPEG', margin, position, contentW, imgH);
      heightLeft -= pageH - margin * 2;

      while (heightLeft > 0) {
        position = margin - (imgH - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', margin, position, contentW, imgH);
        heightLeft -= pageH - margin * 2;
      }

      const doc = this.informe()?.paciente?.numero_documento || this.idPaciente();
      pdf.save(`Informe_${doc}_${Date.now()}.pdf`);
      this.alert.closeLoading();
      this.alert.success('PDF generado');
    } catch (e) {
      console.error(e);
      this.alert.closeLoading();
      this.alert.error('No se pudo exportar el PDF');
    } finally {
      this.exporting.set(false);
    }
  }
}
