import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { NgbModal, NgbModalModule, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { Subject, of, firstValueFrom } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { PacientesService } from '../pacientes/pacientes.service';
import { HistoriaClinicaService } from '../historia-clinica/historia-clinica.service';
import { AgendaService } from '../agenda/agenda.service';
import { DocumentosService } from '../documentos/documentos.service';

export type TabAtencion = 'resumen' | 'atenciones' | 'archivos' | 'agenda';
export type FiltroAgendaPac = 'proximas' | 'pasadas' | 'no_realizadas' | 'todas';

type SeccionCfg = {
  key: string;
  recurso: string;
  titulo: string;
  icon: string;
  hasNoRefiere: boolean;
  pk: string;
};

@Component({
  selector: 'app-atencion-paciente',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, NgSelectModule, NgbModalModule],
  templateUrl: './atencion-paciente.component.html',
  styleUrls: ['./atencion-paciente.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtencionPacienteComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private modal = inject(NgbModal);
  private pacientes = inject(PacientesService);
  private hc = inject(HistoriaClinicaService);
  private agenda = inject(AgendaService);
  private documentos = inject(DocumentosService);
  private http = inject(HttpClient);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);

  idPaciente = signal(0);
  idCita = signal<number | null>(null);
  idConsulta = signal<number | null>(null);
  idSede = signal<number | null>(null);
  idPersonal = signal<number | null>(null);

  paciente = signal<any>(null);
  loading = signal(true);
  tab = signal<TabAtencion>('resumen');
  seccionesData = signal<Record<string, any[]>>({});
  noRefiere = signal<Record<string, boolean>>({});
  seccionActiva = signal<SeccionCfg | null>(null);

  /** Tab Atenciones */
  citasPaciente = signal<any[]>([]);
  citaSel = signal<any | null>(null);
  consultaDetalle = signal<any | null>(null);
  loadingConsulta = signal(false);
  atenSubTab = signal<'resumen' | 'documentos'>('resumen');

  /** Tab Archivos */
  documentosPaciente = signal<any[]>([]);
  loadingDocs = signal(false);

  /** Tab Agenda */
  filtroAgenda = signal<FiltroAgendaPac>('proximas');
  loadingAgenda = signal(false);
  readonly filtrosAgenda: { id: FiltroAgendaPac; label: string; icon: string }[] = [
    { id: 'proximas', label: 'Próximas', icon: 'bi-clock' },
    { id: 'pasadas', label: 'Pasadas', icon: 'bi-arrow-counterclockwise' },
    { id: 'no_realizadas', label: 'No realizadas', icon: 'bi-calendar-x' },
    { id: 'todas', label: 'Todas', icon: 'bi-calendar3' },
  ];

  citasAgendaFiltradas = computed(() => {
    const list = this.citasPaciente();
    const filtro = this.filtroAgenda();
    const hoy = this.hoyLocal();
    return list.filter((c) => this.citaEnFiltro(c, filtro, hoy));
  });

  docsDeCitaSel = computed(() => {
    const idCons = Number(this.citaSel()?.id_consulta || this.consultaDetalle()?.id_consulta || 0);
    const idCita = Number(this.citaSel()?.id_cita || 0);
    const docs = this.documentosPaciente();
    if (!docs.length) return [];
    if (idCons) {
      const byCons = docs.filter((d) => Number(d.id_consulta) === idCons);
      if (byCons.length) return byCons;
    }
    if (idCita) return docs.filter((d) => Number(d.id_cita) === idCita);
    return [];
  });

  private modalRef: NgbModalRef | null = null;
  formModal!: FormGroup;

  cie10Typeahead$ = new Subject<string>();
  cie10Options = signal<any[]>([]);
  medTypeahead$ = new Subject<string>();
  medOptions = signal<any[]>([]);

  readonly tabs: { id: TabAtencion; label: string }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'atenciones', label: 'Atenciones' },
    { id: 'archivos', label: 'Archivos' },
    { id: 'agenda', label: 'Agenda' },
  ];

  readonly secciones: SeccionCfg[] = [
    {
      key: 'vitales',
      recurso: 'vitales',
      titulo: 'Funciones Vitales',
      icon: 'bi-heart-pulse',
      hasNoRefiere: false,
      pk: 'id_paciente_funcion_vital',
    },
    {
      key: 'patologicos',
      recurso: 'antecedentes-patologicos',
      titulo: 'Antecedentes patológicos',
      icon: 'bi-folder2-open',
      hasNoRefiere: false,
      pk: 'id_paciente_antecedente_patologico',
    },
    {
      key: 'alergias',
      recurso: 'alergias',
      titulo: 'Alergias y RAMs',
      icon: 'bi-exclamation-triangle',
      hasNoRefiere: true,
      pk: 'id_paciente_alergia_ram',
    },
    {
      key: 'medidas',
      recurso: 'medidas',
      titulo: 'Medidas',
      icon: 'bi-rulers',
      hasNoRefiere: false,
      pk: 'id_paciente_medida',
    },
    {
      key: 'oftalmologicos',
      recurso: 'antecedentes-oftalmologicos',
      titulo: 'Antecedentes Oftalmológicos',
      icon: 'bi-eye',
      hasNoRefiere: true,
      pk: 'id_paciente_antecedente_oftalmologico',
    },
    {
      key: 'gineco',
      recurso: 'gineco-obstetricos',
      titulo: 'Antecedentes Ginecoobstétricos',
      icon: 'bi-gender-female',
      hasNoRefiere: true,
      pk: 'id_paciente_gineco_obstetrico',
    },
    {
      key: 'familiares',
      recurso: 'antecedentes-familiares',
      titulo: 'Antecedentes Familiares',
      icon: 'bi-people',
      hasNoRefiere: true,
      pk: 'id_paciente_antecedente_familiar',
    },
    {
      key: 'medicaciones',
      recurso: 'medicaciones',
      titulo: 'Medicación habitual',
      icon: 'bi-capsule',
      hasNoRefiere: true,
      pk: 'id_paciente_medicacion_habitual',
    },
    {
      key: 'embarazo_actual',
      recurso: 'embarazos',
      titulo: 'Embarazo actual',
      icon: 'bi-balloon',
      hasNoRefiere: true,
      pk: 'id_paciente_embarazo',
    },
    {
      key: 'notas',
      recurso: 'notas-adicionales',
      titulo: 'Notas Adicionales',
      icon: 'bi-sticky',
      hasNoRefiere: true,
      pk: 'id_paciente_nota_adicional',
    },
    {
      key: 'personales',
      recurso: 'antecedentes-personales',
      titulo: 'Antecedentes personales',
      icon: 'bi-person-lines-fill',
      hasNoRefiere: true,
      pk: 'id_paciente_antecedente_personal',
    },
    {
      key: 'quirurgicos',
      recurso: 'antecedentes-quirurgicos',
      titulo: 'Antecedentes Quirúrgicos',
      icon: 'bi-scissors',
      hasNoRefiere: true,
      pk: 'id_paciente_antecedente_quirurgico',
    },
    {
      key: 'embarazos',
      recurso: 'embarazos',
      titulo: 'Embarazos',
      icon: 'bi-calendar-heart',
      hasNoRefiere: false,
      pk: 'id_paciente_embarazo',
    },
  ];

  readonly alergiasCatalogo = [
    'Penicilina',
    'AINE / Ibuprofeno',
    'Aspirina',
    'Sulfas',
    'Látex',
    'Yodo',
    'Mariscos',
    'Huevo',
    'Polen',
    'Otra',
  ].map((n) => ({ id: n, nombre: n }));

  readonly parentescos = [
    'Madre',
    'Padre',
    'Hermano/a',
    'Abuelo/a',
    'Tío/a',
    'Hijo/a',
    'Cónyuge',
    'Otro',
  ].map((n) => ({ id: n, nombre: n }));

  readonly personalesCatalogo = [
    { id: 'HABITO', nombre: 'Hábito' },
    { id: 'TOXICO', nombre: 'Tóxico' },
    { id: 'SOCIAL', nombre: 'Social' },
    { id: 'OTRO', nombre: 'Otro' },
  ];

  readonly embarazoDatos = [
    'En curso',
    'Primer trimestre',
    'Segundo trimestre',
    'Tercer trimestre',
    'Alto riesgo',
    'Otro',
  ].map((n) => ({ id: n, nombre: n }));

  nombreFmt = computed(() => {
    const p = this.paciente();
    if (!p) return 'Paciente';
    return `${p.apellidos || ''}, ${p.nombres || ''}`.trim().replace(/^,\s*/, '');
  });

  iniciales = computed(() => {
    const p = this.paciente();
    const a = String(p?.apellidos || '?').charAt(0);
    const n = String(p?.nombres || '?').charAt(0);
    return (a + n).toUpperCase();
  });

  edadLabel = computed(() => {
    const p = this.paciente();
    if (!p?.fecha_nacimiento) return '';
    const fn = new Date(p.fecha_nacimiento);
    if (isNaN(fn.getTime())) return '';
    const hoy = new Date();
    let edad = hoy.getFullYear() - fn.getFullYear();
    const m = hoy.getMonth() - fn.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) edad--;
    return `${edad} años`;
  });

  ngOnInit() {
    this.formModal = this.fb.group({});
    this.cie10Typeahead$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((term) =>
          term?.trim()?.length >= 2
            ? this.hc.buscarCie10(term.trim()).pipe(catchError(() => of({ data: [] })))
            : of({ data: [] }),
        ),
      )
      .subscribe((res: any) => {
        const list = (res.data?.data || res.data || res || []).map((x: any) => ({
          ...x,
          label: `${x.codigo || ''} — ${x.descripcion || x.nombre || ''}`.trim(),
        }));
        this.cie10Options.set(list);
      });

    this.medTypeahead$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((term) =>
          term?.trim()?.length >= 2
            ? this.hc.buscarMedicamentos(term.trim()).pipe(catchError(() => of({ data: [] })))
            : of({ data: [] }),
        ),
      )
      .subscribe((res: any) => this.medOptions.set(res.data?.data || res.data || res || []));

    this.route.queryParamMap.subscribe((q) => {
      const id = Number(q.get('id_paciente') || 0);
      this.idPaciente.set(id);
      this.idCita.set(q.get('id_cita') ? Number(q.get('id_cita')) : null);
      this.idConsulta.set(q.get('id_consulta') ? Number(q.get('id_consulta')) : null);
      this.idSede.set(q.get('id_sede') ? Number(q.get('id_sede')) : null);
      this.idPersonal.set(q.get('id_personal') ? Number(q.get('id_personal')) : null);
      const tabQ = q.get('tab') as TabAtencion | null;
      if (tabQ && ['resumen', 'atenciones', 'archivos', 'agenda'].includes(tabQ)) {
        this.tab.set(tabQ);
      }
      if (id) this.cargarTodo(id);
      else this.loading.set(false);
    });
  }

  setTab(t: TabAtencion) {
    this.tab.set(t);
    const id = this.idPaciente();
    if (!id) return;
    if (t === 'atenciones' || t === 'agenda') {
      if (!this.citasPaciente().length) this.cargarCitasPaciente(id);
    }
    if (t === 'archivos' || t === 'atenciones') {
      if (!this.documentosPaciente().length) this.cargarDocumentos(id);
    }
  }

  trackItem(sec: SeccionCfg, it: any): number | string {
    return it?.[sec.pk] ?? it?.id ?? JSON.stringify(it);
  }

  itemsDe(sec: SeccionCfg): any[] {
    const all = this.seccionesData()[sec.recurso] || [];
    if (sec.key === 'embarazo_actual') {
      return all.filter((e) => String(e.estado_embarazo || '').toUpperCase() === 'EN_CURSO');
    }
    if (sec.key === 'embarazos') {
      return all.filter((e) => String(e.estado_embarazo || '').toUpperCase() !== 'EN_CURSO');
    }
    return all;
  }

  noRefiereSec(sec: SeccionCfg): boolean {
    return !!this.noRefiere()[sec.key];
  }

  cargarTodo(id: number) {
    this.loading.set(true);
    this.citasPaciente.set([]);
    this.documentosPaciente.set([]);
    this.citaSel.set(null);
    this.consultaDetalle.set(null);
    this.pacientes.findOne(id).subscribe({
      next: (res: any) => {
        this.paciente.set(res.data || res);
      },
      error: () => this.alert.error('No se pudo cargar el paciente'),
    });
    this.pacientes.getHistoriaResumen(id).subscribe({
      next: (res: any) => {
        const data = res.data || res || {};
        this.seccionesData.set(data.secciones || {});
        this.noRefiere.set(data.no_refiere || {});
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.alert.error('No se pudo cargar el resumen clínico');
      },
    });
    if (this.tab() === 'atenciones' || this.tab() === 'agenda') this.cargarCitasPaciente(id);
    if (this.tab() === 'archivos' || this.tab() === 'atenciones') this.cargarDocumentos(id);
  }

  cargarCitasPaciente(id: number) {
    this.loadingAgenda.set(true);
    this.agenda.findAll(1, 200, '', { id_paciente: id }).subscribe({
      next: (res: any) => {
        const list = res.data?.data || res.data || res || [];
        this.citasPaciente.set(Array.isArray(list) ? list : []);
        this.loadingAgenda.set(false);
        if (this.tab() === 'atenciones') {
          const prefer =
            this.citasPaciente().find((c) => Number(c.id_cita) === Number(this.idCita())) ||
            this.citasPaciente().find((c) => Number(c.id_consulta) === Number(this.idConsulta())) ||
            this.citasPaciente()[0] ||
            null;
          if (prefer) this.seleccionarCita(prefer);
        }
      },
      error: () => {
        this.loadingAgenda.set(false);
        this.alert.error('No se pudieron cargar las citas');
      },
    });
  }

  cargarDocumentos(id: number) {
    this.loadingDocs.set(true);
    this.documentos.findAll(1, 100, '', { id_paciente: id }).subscribe({
      next: (res: any) => {
        const raw = res?.data?.data ?? res?.data ?? res;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
        this.documentosPaciente.set(list);
        this.loadingDocs.set(false);
      },
      error: (err) => {
        this.loadingDocs.set(false);
        this.documentosPaciente.set([]);
        this.alert.error(err?.error?.mensaje || err?.error?.message || 'No se pudieron cargar los documentos');
      },
    });
  }

  async verDocumento(item: any) {
    const id = Number(item?.id_documento);
    if (!id) return;
    const token = localStorage.getItem('token') || '';
    const url = this.documentos.archivoUrl(id);
    try {
      const blob = await firstValueFrom(
        this.http.get(url, {
          headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
          responseType: 'blob',
        }),
      );
      if (!blob) return;
      const obj = URL.createObjectURL(blob);
      window.open(obj, '_blank');
    } catch {
      this.alert.error('No se pudo abrir el archivo.');
    }
  }

  setFiltroAgenda(f: FiltroAgendaPac) {
    this.filtroAgenda.set(f);
  }

  private hoyLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private fechaCitaIso(c: any): string {
    const raw = String(c?.fecha_cita || '').slice(0, 10);
    return raw;
  }

  private citaEnFiltro(c: any, filtro: FiltroAgendaPac, hoy: string): boolean {
    const est = String(c?.estado || '').toUpperCase();
    const fecha = this.fechaCitaIso(c);
    const noRealizada = est === 'CANCELADA' || est === 'NO_ASISTIO';
    if (filtro === 'todas') return true;
    if (filtro === 'no_realizadas') return noRealizada;
    if (filtro === 'pasadas') {
      if (noRealizada) return false;
      return est === 'FINALIZADA' || (!!fecha && fecha < hoy);
    }
    // proximas
    if (noRealizada || est === 'FINALIZADA') return false;
    return !fecha || fecha >= hoy;
  }

  tituloAgendaFiltro(): { titulo: string; sub: string } {
    switch (this.filtroAgenda()) {
      case 'pasadas':
        return { titulo: 'Citas pasadas', sub: 'Historial de citas del paciente' };
      case 'no_realizadas':
        return { titulo: 'Citas no realizadas', sub: 'Canceladas o con inasistencia' };
      case 'todas':
        return { titulo: 'Todas las citas', sub: 'Historial completo del paciente' };
      default:
        return { titulo: 'Citas próximas', sub: 'Citas programadas pendientes' };
    }
  }

  labelEstadoCita(estado: string): string {
    const map: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      CONFIRMADA: 'Confirmada',
      EN_ATENCION: 'En atención',
      FINALIZADA: 'Completada',
      CANCELADA: 'Cancelada',
      NO_ASISTIO: 'No asistió',
      REPROGRAMADA: 'Reprogramada',
    };
    return map[String(estado || '').toUpperCase()] || estado || '—';
  }

  badgeEstadoCita(estado: string): string {
    const e = String(estado || '').toUpperCase();
    if (e === 'FINALIZADA') return 'ok';
    if (e === 'CANCELADA' || e === 'NO_ASISTIO') return 'danger';
    if (e === 'EN_ATENCION') return 'warn';
    if (e === 'CONFIRMADA') return 'info';
    return '';
  }

  servicioCita(c: any): string {
    return c?.tratamiento || c?.tipo_cita || c?.motivo_consulta || 'Consulta';
  }

  horaRangoCita(c: any): string {
    const a = String(c?.hora_inicio || '').slice(0, 5);
    const b = String(c?.hora_fin || c?.hora_fin_recurso || '').slice(0, 5);
    if (a && b) return `${a} - ${b}`;
    return a || '—';
  }

  fechaAgendaFmt(c: any): string {
    const raw = this.fechaCitaIso(c);
    if (!raw) return '—';
    const d = new Date(raw + 'T12:00:00');
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  tamanoDoc(bytes: number | null | undefined): string {
    const n = Number(bytes || 0);
    if (!n) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  fechaDocFmt(d: any): string {
    const raw = String(d?.fecha_documento || d?.fecha_crea || '').slice(0, 10);
    if (!raw) return '—';
    const dt = new Date(raw + 'T12:00:00');
    if (isNaN(dt.getTime())) return raw;
    return dt.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  seleccionarCita(c: any) {
    this.citaSel.set(c);
    this.atenSubTab.set('resumen');
    this.consultaDetalle.set(null);
    if (this.idPaciente() && !this.documentosPaciente().length) {
      this.cargarDocumentos(this.idPaciente());
    }
    const idCons = Number(c?.id_consulta || 0);
    if (!idCons) return;
    this.loadingConsulta.set(true);
    this.hc.findOne(idCons).subscribe({
      next: (res: any) => {
        this.consultaDetalle.set(res.data || res);
        this.loadingConsulta.set(false);
      },
      error: () => {
        this.loadingConsulta.set(false);
        this.alert.warning('Sin registro de atención para esta cita');
      },
    });
  }

  tituloCita(c: any): string {
    return c?.tratamiento || c?.tipo_cita || c?.motivo_consulta || 'Cita';
  }

  fechaCitaCorta(c: any): string {
    const raw = c?.fecha_cita;
    if (!raw) return '';
    const d = new Date(typeof raw === 'string' && raw.length <= 10 ? raw + 'T12:00:00' : raw);
    if (isNaN(d.getTime())) return String(raw).slice(0, 10);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  }

  horaCita(c: any): string {
    const h = String(c?.hora_inicio || '').slice(0, 5);
    if (!h) return '';
    const [hh, mm] = h.split(':').map(Number);
    const ampm = hh >= 12 ? 'p.m.' : 'a.m.';
    const h12 = ((hh + 11) % 12) + 1;
    return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
  }

  estadoConsultaLabel(c: any): string {
    const e = String(c?.consulta_estado || this.consultaDetalle()?.estado || '').toUpperCase();
    if (e === 'FINALIZADA') return 'Completada';
    if (e === 'BORRADOR') return 'En curso';
    if (!c?.id_consulta) return 'Sin atención';
    return e || '—';
  }

  irAtenderDesdeCita(c: any) {
    if (!c) return;
    this.router.navigate(['/historia-clinica'], {
      queryParams: {
        id_cita: c.id_cita,
        id_paciente: this.idPaciente(),
        id_sede: c.id_sede || this.idSede(),
        id_personal: c.id_personal || this.idPersonal(),
        id_consulta: c.id_consulta || null,
      },
    });
  }

  refrescarSecciones() {
    const id = this.idPaciente();
    if (!id) return;
    this.pacientes.getHistoriaResumen(id).subscribe({
      next: (res: any) => {
        const data = res.data || res || {};
        this.seccionesData.set(data.secciones || {});
        this.noRefiere.set(data.no_refiere || {});
      },
    });
  }

  abrirAgregar(sec: SeccionCfg, tpl: TemplateRef<any>) {
    if (!this.perms.hasPermission('crear_historia_paciente')) {
      this.alert.warning('Sin permiso para registrar');
      return;
    }
    this.seccionActiva.set(sec);
    this.formModal = this.buildForm(sec.key);
    this.modalRef = this.modal.open(tpl, {
      centered: true,
      size: sec.key === 'gineco' ? 'lg' : 'md',
      backdrop: 'static',
      scrollable: true,
      windowClass: 'atencion-modal',
    });
  }

  cerrarModal() {
    this.modalRef?.dismiss();
    this.modalRef = null;
    this.seccionActiva.set(null);
  }

  marcarNoRefiere(sec: SeccionCfg) {
    if (!this.perms.hasPermission('actualizar_historia_paciente')) return;
    const id = this.idPaciente();
    this.pacientes.setSeccionNoRefiere(id, sec.key, true).subscribe({
      next: () => {
        this.noRefiere.update((m) => ({ ...m, [sec.key]: true }));
        this.alert.success('Marcado como «No refiere»');
      },
      error: (e) => this.alert.error(e.error?.mensaje || 'No se pudo guardar'),
    });
  }

  eliminarItem(sec: SeccionCfg, item: any) {
    if (!this.perms.hasPermission('eliminar_historia_paciente')) return;
    this.alert.confirmAction('¿Eliminar registro?', '', 'Sí, eliminar').then((ok) => {
      if (!ok) return;
      const pk = item[sec.pk];
      this.pacientes.removeHistoria(this.idPaciente(), sec.recurso, pk).subscribe({
        next: () => {
          this.alert.success('Eliminado');
          this.refrescarSecciones();
        },
        error: (e) => this.alert.error(e.error?.mensaje || 'Error al eliminar'),
      });
    });
  }

  completar(modal: any) {
    if (this.formModal.invalid) {
      this.formModal.markAllAsTouched();
      this.alert.warning('Complete los campos requeridos');
      return;
    }
    const sec = this.seccionActiva();
    if (!sec) return;
    const datos = this.payloadDesdeForm(sec.key, this.formModal.getRawValue());
    this.alert.showLoading('Guardando…');
    this.pacientes.addHistoria(this.idPaciente(), sec.recurso, datos).subscribe({
      next: () => {
        this.alert.closeLoading();
        this.alert.success('Registro guardado');
        if (this.noRefiere()[sec.key]) {
          this.pacientes.setSeccionNoRefiere(this.idPaciente(), sec.key, false).subscribe();
          this.noRefiere.update((m) => ({ ...m, [sec.key]: false }));
        }
        modal.close();
        this.refrescarSecciones();
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(e.error?.mensaje || 'No se pudo guardar');
      },
    });
  }

  irAHistoriaClinica() {
    this.router.navigate(['/historia-clinica'], {
      queryParams: {
        id_cita: this.idCita(),
        id_paciente: this.idPaciente(),
        id_sede: this.idSede(),
        id_personal: this.idPersonal(),
        id_consulta: this.idConsulta(),
      },
    });
  }

  volverAgenda() {
    this.router.navigate(['/agenda']);
  }

  onCie10Search(term: string) {
    this.cie10Typeahead$.next(term || '');
  }

  onCie10Select(item: any) {
    if (!item) return;
    this.formModal.patchValue({
      diagnostico: item.descripcion || item.nombre || item.codigo,
      codigo_cie10: item.codigo,
    });
  }

  onMedSearch(term: string) {
    this.medTypeahead$.next(term || '');
  }

  onMedSelect(item: any) {
    if (!item) return;
    const nom = item.nombre || item.medicamento || item;
    this.formModal.patchValue({ medicamento: typeof nom === 'string' ? nom : String(nom) });
  }

  calcImcPreview(): string | null {
    const peso = Number(this.formModal?.get('peso_kg')?.value);
    const tallaM = Number(this.formModal?.get('talla_m')?.value);
    if (!peso || !tallaM) return null;
    const imc = Math.round((peso / (tallaM * tallaM)) * 100) / 100;
    return String(imc);
  }

  labelItem(sec: SeccionCfg, item: any): string {
    switch (sec.key) {
      case 'vitales':
        return [
          item.frecuencia_cardiaca != null ? `FC ${item.frecuencia_cardiaca}` : null,
          item.presion_sistolica != null
            ? `PA ${item.presion_sistolica}/${item.presion_diastolica ?? '—'}`
            : null,
          item.temperatura_c != null ? `${item.temperatura_c}°C` : null,
          item.saturacion_o2 != null ? `Sat ${item.saturacion_o2}%` : null,
        ]
          .filter(Boolean)
          .join(' · ');
      case 'patologicos':
        return [item.diagnostico, item.codigo_cie10].filter(Boolean).join(' ');
      case 'alergias':
        return item.sustancia;
      case 'medidas':
        return [
          item.peso_kg != null ? `${item.peso_kg} kg` : null,
          item.talla_cm != null ? `${(Number(item.talla_cm) / 100).toFixed(2)} m` : null,
          item.imc != null ? `IMC ${item.imc}` : null,
          item.porcentaje_grasa != null ? `${item.porcentaje_grasa}% grasa` : null,
        ]
          .filter(Boolean)
          .join(' · ');
      case 'oftalmologicos':
        return item.nombre;
      case 'gineco':
        return [
          item.menarquia_edad != null ? `Menarquia ${item.menarquia_edad}` : null,
          item.metodo_anticonceptivo || null,
          item.observaciones || null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Registro gineco-obstétrico';
      case 'familiares':
        return [item.parentesco, item.diagnostico || item.observaciones].filter(Boolean).join(' — ');
      case 'medicaciones':
        return item.medicamento;
      case 'embarazo_actual':
        return item.dato_embarazo || item.estado_embarazo || 'Embarazo en curso';
      case 'notas':
        return String(item.contenido || '').slice(0, 120);
      case 'personales':
        return [item.tipo, item.descripcion || item.observaciones].filter(Boolean).join(' — ');
      case 'quirurgicos':
        return item.procedimiento;
      case 'embarazos':
        return [
          item.fecha_nacimiento || item.fecha_inicio,
          item.lugar_nacimiento,
          item.peso_al_nacer,
        ]
          .filter(Boolean)
          .join(' · ') || 'Embarazo';
      default:
        return 'Registro';
    }
  }

  fechaItem(sec: SeccionCfg, item: any): string {
    const raw =
      item.fecha_diagnostico ||
      item.fecha_registro ||
      item.fecha_medida ||
      item.fecha_nota ||
      item.fecha_nacimiento ||
      item.fecha_cirugia ||
      item.fur ||
      null;
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw).slice(0, 10);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  }

  private buildForm(key: string): FormGroup {
    switch (key) {
      case 'vitales':
        return this.fb.group({
          frecuencia_cardiaca: [null],
          frecuencia_respiratoria: [null],
          presion_sistolica: [null],
          presion_diastolica: [null],
          temperatura_c: [null],
          saturacion_o2: [null],
        });
      case 'patologicos':
        return this.fb.group({
          diagnostico: ['', Validators.required],
          codigo_cie10: [''],
          fecha_diagnostico: [''],
          observaciones: [''],
          activo: [true],
          informacion_dudosa: [false],
          cie10_sel: [null],
        });
      case 'alergias':
        return this.fb.group({
          sustancia: [null, Validators.required],
          observaciones: [''],
          informacion_dudosa: [false],
          tipo: ['MEDICAMENTO'],
          severidad: ['MODERADA'],
          activa: [true],
        });
      case 'medidas':
        return this.fb.group({
          peso_kg: [null],
          talla_m: [null],
          porcentaje_grasa: [null],
        });
      case 'oftalmologicos':
        return this.fb.group({
          nombre: ['', Validators.required],
          comentario: [''],
          informacion_dudosa: [false],
        });
      case 'gineco':
        return this.fb.group({
          menarquia_edad: [null],
          regimen_catamenial: [''],
          inicio_relaciones_sexuales: [''],
          num_parejas_sexuales: [''],
          fur: [''],
          fecha_ultimo_pap: [''],
          metodo_anticonceptivo: [''],
          observaciones: [''],
        });
      case 'familiares':
        return this.fb.group({
          parentesco: [null, Validators.required],
          observaciones: [''],
          diagnostico: [''],
          informacion_dudosa: [false],
        });
      case 'medicaciones':
        return this.fb.group({
          medicamento: ['', Validators.required],
          observaciones: [''],
          informacion_dudosa: [false],
          med_sel: [null],
          activo: [true],
        });
      case 'embarazo_actual':
        return this.fb.group({
          dato_embarazo: [null, Validators.required],
          observaciones: [''],
          informacion_dudosa: [false],
          estado_embarazo: ['EN_CURSO'],
        });
      case 'notas':
        return this.fb.group({
          contenido: ['', Validators.required],
        });
      case 'personales':
        return this.fb.group({
          tipo: [null, Validators.required],
          observaciones: [''],
          descripcion: [''],
          informacion_dudosa: [false],
        });
      case 'quirurgicos':
        return this.fb.group({
          procedimiento: ['', Validators.required],
          observaciones: [''],
          informacion_dudosa: [false],
        });
      case 'embarazos':
        return this.fb.group({
          fecha_nacimiento: [''],
          lugar_nacimiento: [''],
          peso_al_nacer: [''],
          edad_gestacional_nacer: [''],
          observaciones: [''],
          informacion_dudosa: [false],
          estado_embarazo: ['CULMINADO'],
        });
      default:
        return this.fb.group({});
    }
  }

  private payloadDesdeForm(key: string, raw: any): any {
    const d = { ...raw };
    delete d.cie10_sel;
    delete d.med_sel;

    if (key === 'medidas') {
      const tallaM = Number(d.talla_m);
      const peso = Number(d.peso_kg);
      const out: any = {
        fecha_medida: new Date().toISOString().slice(0, 19).replace('T', ' '),
        peso_kg: peso || null,
        porcentaje_grasa: d.porcentaje_grasa != null && d.porcentaje_grasa !== '' ? Number(d.porcentaje_grasa) : null,
      };
      if (tallaM) {
        out.talla_cm = Math.round(tallaM * 10000) / 100;
        if (peso) out.imc = Math.round((peso / (tallaM * tallaM)) * 100) / 100;
      }
      return out;
    }
    if (key === 'vitales') {
      return {
        fecha_registro: new Date().toISOString().slice(0, 19).replace('T', ' '),
        frecuencia_cardiaca: d.frecuencia_cardiaca ?? null,
        frecuencia_respiratoria: d.frecuencia_respiratoria ?? null,
        presion_sistolica: d.presion_sistolica ?? null,
        presion_diastolica: d.presion_diastolica ?? null,
        temperatura_c: d.temperatura_c ?? null,
        saturacion_o2: d.saturacion_o2 ?? null,
      };
    }
    if (key === 'patologicos') {
      return {
        diagnostico: d.diagnostico,
        codigo_cie10: d.codigo_cie10 || null,
        fecha_diagnostico: d.fecha_diagnostico || null,
        observaciones: d.observaciones || null,
        activo: d.activo ? 1 : 0,
        informacion_dudosa: d.informacion_dudosa ? 1 : 0,
      };
    }
    if (key === 'alergias') {
      return {
        sustancia: d.sustancia,
        observaciones: d.observaciones || null,
        informacion_dudosa: d.informacion_dudosa ? 1 : 0,
        tipo: d.tipo || 'MEDICAMENTO',
        severidad: d.severidad || 'MODERADA',
        activa: 1,
      };
    }
    if (key === 'oftalmologicos') {
      return {
        nombre: d.nombre,
        comentario: d.comentario || null,
        informacion_dudosa: d.informacion_dudosa ? 1 : 0,
      };
    }
    if (key === 'gineco') {
      return {
        menarquia_edad: d.menarquia_edad != null && d.menarquia_edad !== '' ? String(d.menarquia_edad) : null,
        regimen_catamenial: d.regimen_catamenial || null,
        inicio_relaciones_sexuales: d.inicio_relaciones_sexuales || null,
        num_parejas_sexuales: d.num_parejas_sexuales || null,
        fur: d.fur || null,
        fecha_ultimo_pap: d.fecha_ultimo_pap || null,
        metodo_anticonceptivo: d.metodo_anticonceptivo || null,
        observaciones: d.observaciones || null,
      };
    }
    if (key === 'familiares') {
      return {
        parentesco: d.parentesco,
        observaciones: d.observaciones || null,
        diagnostico: d.observaciones || d.parentesco,
        informacion_dudosa: d.informacion_dudosa ? 1 : 0,
      };
    }
    if (key === 'medicaciones') {
      return {
        medicamento: d.medicamento,
        observaciones: d.observaciones || null,
        informacion_dudosa: d.informacion_dudosa ? 1 : 0,
        activo: 1,
      };
    }
    if (key === 'embarazo_actual') {
      return {
        estado_embarazo: 'EN_CURSO',
        dato_embarazo: d.dato_embarazo,
        observaciones: d.observaciones || null,
        informacion_dudosa: d.informacion_dudosa ? 1 : 0,
      };
    }
    if (key === 'notas') {
      return { contenido: d.contenido };
    }
    if (key === 'personales') {
      return {
        tipo: d.tipo,
        descripcion: d.observaciones || d.tipo,
        observaciones: d.observaciones || null,
        informacion_dudosa: d.informacion_dudosa ? 1 : 0,
      };
    }
    if (key === 'quirurgicos') {
      return {
        procedimiento: d.procedimiento,
        observaciones: d.observaciones || null,
        informacion_dudosa: d.informacion_dudosa ? 1 : 0,
      };
    }
    if (key === 'embarazos') {
      return {
        estado_embarazo: 'CULMINADO',
        fecha_nacimiento: d.fecha_nacimiento || null,
        fecha_inicio: d.fecha_nacimiento || null,
        lugar_nacimiento: d.lugar_nacimiento || null,
        peso_al_nacer: d.peso_al_nacer || null,
        edad_gestacional_nacer: d.edad_gestacional_nacer || null,
        observaciones: d.observaciones || null,
        informacion_dudosa: d.informacion_dudosa ? 1 : 0,
      };
    }
    return d;
  }
}
