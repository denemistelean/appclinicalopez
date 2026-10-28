import {
  AfterViewInit,
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
  signal,
  computed,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormControl } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal, NgbModalModule, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { SedeContextService } from 'src/app/core/services/sede-context.service';
import { UnidadContextService } from 'src/app/core/services/unidad-context.service';
import { SedesService } from '../sedes/sedes.service';
import { PersonalService } from '../personal/personal.service';
import { PacientesService } from '../pacientes/pacientes.service';
import { TratamientosService } from '../tratamientos/tratamientos.service';
import { AgendaService } from './agenda.service';
import { HistoriaDigitalService } from '../historia-digital/historia-digital.service';

export type VistaAgenda = 'dia' | 'horario' | 'semana' | 'board';

const ESTADOS_BOARD = ['PENDIENTE', 'CONFIRMADA', 'EN_ATENCION', 'FINALIZADA'] as const;

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormErrorComponent, NgSelectModule, NgbModalModule],
  templateUrl: './agenda.component.html',
  styleUrls: ['./agenda.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaComponent implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private service = inject(AgendaService);
  private sedesService = inject(SedesService);
  private personalService = inject(PersonalService);
  private pacientesService = inject(PacientesService);
  private tratamientosService = inject(TratamientosService);
  private hdApi = inject(HistoriaDigitalService);
  private sedeCtx = inject(SedeContextService);
  private unidad = inject(UnidadContextService);
  private alert = inject(AlertService);
  private modal = inject(NgbModal);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  public perms = inject(PermissionsService);

  @ViewChild('modalCita') modalCitaTpl?: TemplateRef<any>;
  private queryPrefillConsumido = false;

  form: FormGroup;
  fechaDia = new FormControl(
    (() => {
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    })(),
    { nonNullable: true },
  );
  buscarPaciente = new FormControl('', { nonNullable: true });

  vista = signal<VistaAgenda>('dia');
  dayData = signal<any>(null);
  weekData = signal<any>(null);
  loading = signal(false);
  validacion = signal<any>(null);
  sugerencia = signal<string | null>(null);
  /** Tras Aceptar el horario sugerido: oculta Aceptar y deja solo Cancelar. */
  sugerenciaAceptada = signal(false);
  waitlist = signal<any[]>([]);
  paquetes = signal<any[]>([]);
  /** Planes HD con sesiones pendientes (aviso opcional al crear cita). */
  planesPendientes = signal<any[]>([]);
  planAceptadoId = signal<number | null>(null);
  citaDetalle = signal<any>(null);

  sedes = signal<any[]>([]);
  personal = signal<any[]>([]);
  pacientes = signal<any[]>([]);
  pacientesLoading = signal(false);
  pacTypeahead$ = new Subject<string>();
  tratamientos = signal<any[]>([]);
  tiposCita = signal<any[]>([]);
  tipoSel = signal<any>(null);
  salas = signal<any[]>([]);
  equipos = signal<any[]>([]);

  /** Filtros sidebar (array vacío de especialistas = todos; sedes: al menos una) */
  filtroEspecialistasCtrl = new FormControl<number[]>([], { nonNullable: true });
  filtroSedesCtrl = new FormControl<number[]>([], { nonNullable: true });
  /** Mirror signals para OnPush / computeds */
  filtroEspecialistas = signal<number[]>([]);
  filtroSedes = signal<number[]>([]);
  private defaultsPersonalAplicados = false;

  private modalCitaRef: NgbModalRef | null = null;
  private modalDetalleRef: NgbModalRef | null = null;
  editingCitaId = signal<number | null>(null);

  /** Tooltip flotante al pasar el mouse */
  tooltipCita = signal<any | null>(null);
  tooltipStyle = signal<Record<string, string>>({ display: 'none' });

  /** Etiquetas 08:00–18:00; la grilla termina a las 19:00 */
  horas = Array.from({ length: 11 }, (_, i) => 8 + i);
  dayStartMin = 8 * 60;
  dayEndMin = 19 * 60;
  slotPx = 64;

  readonly horasSlots: { id: string; nombre: string }[] = (() => {
    const out: { id: string; nombre: string }[] = [];
    for (let m = 8 * 60; m < 19 * 60; m += 15) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      const v = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      out.push({ id: v, nombre: v });
    }
    return out;
  })();

  readonly boardCols = [
    { id: 'PENDIENTE', label: 'Pendiente' },
    { id: 'CONFIRMADA', label: 'Confirmada' },
    { id: 'EN_ATENCION', label: 'En atención' },
    { id: 'FINALIZADA', label: 'Finalizada' },
  ];

  readonly estadosFlujo = [
    { id: 'PENDIENTE', label: 'Pendiente', icon: 'bi-file-earmark-text' },
    { id: 'CONFIRMADA', label: 'Confirmada', icon: 'bi-check-lg' },
    { id: 'EN_ATENCION', label: 'En atención', icon: 'bi-people' },
    { id: 'FINALIZADA', label: 'Finalizada', icon: 'bi-calendar-check' },
  ];

  muestraProcedimiento = computed(
    () =>
      this.tipoSel()?.codigo === 'PROCEDIMIENTO' ||
      !!Number(this.tipoSel()?.requiere_tratamiento),
  );

  tiposProcedimiento = [
    { id: 'QUIRURGICO', nombre: 'Procedimientos quirúrgicos' },
    { id: 'NO_QUIRURGICO', nombre: 'Procedimientos no quirúrgicos y tratamientos estéticos' },
  ];

  tipoProcedimientoCtrl = new FormControl<'QUIRURGICO' | 'NO_QUIRURGICO' | null>(null);
  tipoProcedimientoSel = signal<'QUIRURGICO' | 'NO_QUIRURGICO' | null>(null);

  /** Espejos reactivos del formulario (computed no detecta FormControl solos) */
  horaInicioSel = signal('09:00');
  idsTratamientoSel = signal<number[]>([]);

  procedimientosOpciones = computed(() => {
    const tipo = this.tipoProcedimientoSel();
    if (!tipo) return [];
    return (this.tratamientos() || []).filter(
      (t) => String(t.tipo_procedimiento || '').toUpperCase() === tipo,
    );
  });

  duracionEstimadaMin = computed(() => {
    if (!this.muestraProcedimiento()) {
      return Number(this.tipoSel()?.duracion_default_minutos || 30);
    }
    const ids = this.idsTratamientoSel();
    if (!ids.length) return 0;
    const map = new Map(
      (this.tratamientos() || []).map((t) => [
        Number(t.id_tratamiento),
        Number(t.duracion_minutos || 0),
      ]),
    );
    return ids.reduce((acc, id) => acc + (map.get(Number(id)) || 0), 0);
  });

  horaFinEstimada = computed(() => {
    const dur = this.duracionEstimadaMin();
    if (!dur || dur <= 0) return null;
    const ini = String(this.horaInicioSel() || '09:00').slice(0, 5);
    const total = this.toMin(ini) + dur;
    // Si cruza medianoche, mostrar con nota vía formato HH:mm
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });

  /** Dra. Soraya López por defecto */
  private idPersonalDefault(): number | null {
    const list = this.personal();
    const soraya = list.find((p) => {
      const nom = `${p.nombres || ''} ${p.apellidos || ''}`.toUpperCase()
        .normalize('NFD').replace(/\p{M}/gu, '');
      return nom.includes('SORAYA') && nom.includes('LOPEZ');
    });
    return soraya?.id_personal != null ? Number(soraya.id_personal) : list[0]?.id_personal ?? null;
  }

  private idSedeDefault(list: any[]): number | null {
    const lopez = list.find((s) => {
      const n = String(s.nombre || '').toUpperCase().normalize('NFD').replace(/\p{M}/gu, '');
      return (
        (n.includes('ESTETICA') && n.includes('LOPEZ')) ||
        n.includes('CLINICA ESTETICA LOPEZ')
      );
    });
    return lopez?.id_sede != null
      ? Number(lopez.id_sede)
      : this.sedeCtx.idSedeFiltro() || list[0]?.id_sede || null;
  }

  /** Primera sede del filtro (para formularios / waitlist). */
  sedeActiva = computed(() => {
    const ids = this.filtroSedes();
    if (ids.length) return ids[0];
    return this.sedeCtx.idSedeFiltro() || this.sedes()[0]?.id_sede || null;
  });

  sedesSeleccionadas = computed(() => {
    const ids = this.filtroSedes();
    if (ids.length) return ids.map(Number);
    const fallback = this.sedeActiva();
    return fallback ? [Number(fallback)] : [];
  });

  /** Lista única de especialistas (profesionales) de las sedes cargadas. */
  especialistasLista = computed(() => {
    const data = this.dayData();
    const lane = (data?.lanes || []).find((l: any) => l.group === 'Profesionales');
    return (lane?.items || []) as any[];
  });

  personalFiltrado = computed(() => {
    const all = this.especialistasLista();
    const fe = this.filtroEspecialistas();
    if (!fe.length) return all;
    const allowed = new Set(fe.map(Number));
    return all.filter((p) => allowed.has(Number(p.id)));
  });

  citasFiltradas = computed(() => {
    let citas = (this.dayData()?.citas || []) as any[];
    const q = this.buscarPaciente.value.trim().toLowerCase();
    if (q) {
      citas = citas.filter((c) => String(c.paciente || '').toLowerCase().includes(q));
    }
    const fe = this.filtroEspecialistas();
    if (fe.length) {
      const allowed = new Set(fe.map(Number));
      citas = citas.filter((c) => {
        if (allowed.has(Number(c.id_personal))) return true;
        return (c.participantes || []).some((p: any) => allowed.has(Number(p.id_personal)));
      });
    }
    return citas;
  });

  citasPorEstado = computed(() => {
    const map: Record<string, any[]> = {};
    for (const e of ESTADOS_BOARD) map[e] = [];
    for (const c of this.citasFiltradas()) {
      if (map[c.estado]) map[c.estado].push(c);
    }
    return map;
  });

  semanaDias = computed(() => {
    const base = this.parseFecha(this.fechaDia.value);
    const lun = new Date(base);
    const dow = lun.getDay(); // 0=dom
    const diff = dow === 0 ? -6 : 1 - dow;
    lun.setDate(lun.getDate() + diff);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lun);
      d.setDate(lun.getDate() + i);
      return {
        date: d,
        iso: this.toIso(d),
        label: d.toLocaleDateString('es-PE', { weekday: 'short' }).toUpperCase(),
        dayNum: d.getDate(),
      };
    });
  });

  calMesLabel = computed(() => {
    const d = this.parseFecha(this.fechaDia.value);
    return d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  });

  calCeldas = computed(() => {
    const d = this.parseFecha(this.fechaDia.value);
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const startDow = (first.getDay() + 6) % 7; // lun=0
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const cells: { iso: string | null; day: number | null; inMonth: boolean }[] = [];
    for (let i = 0; i < startDow; i++) cells.push({ iso: null, day: null, inMonth: false });
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ iso, day, inMonth: true });
    }
    while (cells.length % 7 !== 0) cells.push({ iso: null, day: null, inMonth: false });
    return cells;
  });

  ahoraTopPx = computed(() => {
    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes();
    if (min < this.dayStartMin || min > this.dayEndMin) return -1;
    return ((min - this.dayStartMin) / 60) * this.slotPx;
  });

  tituloFecha = computed(() => {
    const d = this.parseFecha(this.fechaDia.value);
    if (this.vista() === 'semana') {
      const dias = this.semanaDias();
      const a = dias[0]?.date;
      const b = dias[6]?.date;
      if (!a || !b) return '';
      return `${a.getDate()} – ${b.getDate()} ${b.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' })}`;
    }
    return d.toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  });

  profesionalSemana = computed(() => {
    const filtrados = this.personalFiltrado();
    if (filtrados.length) return filtrados[0];
    const fe = this.filtroEspecialistas();
    if (fe.length) {
      const p = this.personal().find((x) => Number(x.id_personal) === Number(fe[0]));
      if (p) {
        return {
          id: Number(p.id_personal),
          nombre: `${p.nombres || ''} ${p.apellidos || ''}`.trim(),
          rol: p.especialidad || '',
        };
      }
    }
    return this.especialistasLista()[0] || null;
  });

  constructor() {
    this.form = this.fb.group({
      id_sede: [null, Validators.required],
      id_tipo_cita: [null, Validators.required],
      id_paciente: [null, Validators.required],
      id_personal: [null],
      ids_tratamiento: [[] as number[]],
      fecha_cita: [this.fechaDia.value, Validators.required],
      hora_inicio: ['09:00', Validators.required],
      notas: [''],
    });
  }

  ngOnInit() {
    this.service.tiposCita().subscribe({
      next: (res: any) => {
        const list = res.data?.data || res.data || res || [];
        this.tiposCita.set(list);
        const consulta = list.find((t: any) => t.codigo === 'CONSULTA') || list[0];
        if (consulta) {
          this.form.patchValue({ id_tipo_cita: consulta.id_tipo_cita });
          this.tipoSel.set(consulta);
        }
      },
    });
    this.sedesService.findAll(1, 100, '').subscribe({
      next: (res: any) => {
        const list = res.data?.data || res.data || [];
        this.sedes.set(list);
        const sede = this.idSedeDefault(list);
        if (sede) {
          this.setSedesFiltro([Number(sede)], false);
          this.form.patchValue({ id_sede: sede });
          this.cargarSalasEquipos(sede);
        }
        this.recargar();
      },
    });
    this.personalService.findAll(1, 200, '').subscribe({
      next: (res: any) => {
        this.personal.set(res.data?.data || res.data || []);
        const def = this.idPersonalDefault();
        if (def && !this.defaultsPersonalAplicados) {
          this.defaultsPersonalAplicados = true;
          this.form.patchValue({ id_personal: def });
          // Marcar Dra. Soraya en filtro sidebar por defecto
          this.filtroEspecialistas.set([def]);
          this.filtroEspecialistasCtrl.setValue([def], { emitEvent: false });
          // Re-cargar para que Semana/Día respeten el filtro por defecto
          if (this.sedesSeleccionadas().length) this.recargar();
        }
      },
    });
    this.pacientesService.findAll(1, 100, '').subscribe({
      next: (res: any) => this.pacientes.set(this.mapPacientes(res.data?.data || res.data || [])),
    });
    this.pacTypeahead$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((term) => {
          this.pacientesLoading.set(true);
          return this.pacientesService.findAll(1, 50, String(term || '').trim()).pipe(
            catchError(() => of({ data: { data: [] } })),
          );
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.pacientesLoading.set(false);
          this.pacientes.set(this.mapPacientes(res.data?.data || res.data || []));
        },
        error: () => this.pacientesLoading.set(false),
      });
    this.tratamientosService.findAll(1, 100, '', { estado: 'ACTIVO' }).subscribe({
      next: (res: any) => {
        const list = res.data?.data || res.data || [];
        this.tratamientos.set(list);
      },
    });

    this.filtroEspecialistasCtrl.valueChanges.subscribe((ids) => {
      this.filtroEspecialistas.set((ids || []).map(Number));
      if (this.vista() === 'semana' && this.sedesSeleccionadas().length) {
        this.loading.set(true);
        this.cargarSemana(this.sedesSeleccionadas());
      }
    });
    this.filtroSedesCtrl.valueChanges.subscribe((ids) => {
      const clean = (ids || []).map(Number).filter(Boolean);
      if (!clean.length) {
        // Impedir dejar sedes vacías: restaurar al menos la primera
        const fallback =
          this.sedeCtx.idSedeFiltro() || this.sedes()[0]?.id_sede || null;
        if (fallback) {
          this.setSedesFiltro([Number(fallback)], false);
          return;
        }
      }
      this.filtroSedes.set(clean);
      const primaria = clean[0];
      if (primaria) {
        this.form.patchValue({ id_sede: primaria }, { emitEvent: false });
        this.cargarSalasEquipos(primaria);
      }
      this.recargar();
    });

    this.fechaDia.valueChanges.subscribe((f) => {
      this.form.patchValue({ fecha_cita: f });
      this.recargar();
    });
    this.form.get('id_sede')?.valueChanges.subscribe((id) => {
      if (id) {
        this.cargarSalasEquipos(id);
        this.cargarWaitlist();
      }
    });
    this.form.get('id_tipo_cita')?.valueChanges.subscribe((id) => {
      const tipo = this.tiposCita().find((t) => Number(t.id_tipo_cita) === Number(id)) || null;
      this.tipoSel.set(tipo);
      this.validacion.set(null);
      this.sugerencia.set(null);
      this.sugerenciaAceptada.set(false);
      this.tipoProcedimientoSel.set(null);
      this.tipoProcedimientoCtrl.setValue(null, { emitEvent: false });
      this.form.patchValue({ ids_tratamiento: [] });
      this.idsTratamientoSel.set([]);
    });
    this.form.get('id_paciente')?.valueChanges.subscribe((id) => {
      this.planAceptadoId.set(null);
      if (id) {
        this.cargarPaquetes(id);
        this.cargarPlanesPendientes(Number(id));
      } else {
        this.paquetes.set([]);
        this.planesPendientes.set([]);
      }
    });
    this.tipoProcedimientoCtrl.valueChanges.subscribe((tipo) => {
      this.onTipoProcedimientoChange(tipo);
    });
    this.form.get('ids_tratamiento')?.valueChanges.subscribe((ids) => {
      const clean = (Array.isArray(ids) ? ids : [])
        .map((x: any) => Number(x))
        .filter((n: number) => Number.isFinite(n) && n > 0);
      this.idsTratamientoSel.set(clean);
      this.validacion.set(null);
    });
    this.form.get('hora_inicio')?.valueChanges.subscribe((h) => {
      this.horaInicioSel.set(String(h || '09:00').slice(0, 5));
    });
    // sync inicial
    this.horaInicioSel.set(String(this.form.get('hora_inicio')?.value || '09:00').slice(0, 5));
    this.buscarPaciente.valueChanges.subscribe(() => {
      /* computed reacciona vía getRawValue no; forzar con signal dummy no hace falta:
         OnPush + valueChanges no re-renderiza computed que lee FormControl.
         Usamos un tick reasignando el mismo valor de dayData para refresh. */
      this.dayData.update((d) => (d ? { ...d } : d));
    });
  }

  setVista(v: VistaAgenda) {
    this.vista.set(v);
    this.recargar();
  }

  navDia(delta: number) {
    const d = this.parseFecha(this.fechaDia.value);
    if (this.vista() === 'semana') d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    this.fechaDia.setValue(this.toIso(d));
  }

  irHoy() {
    this.fechaDia.setValue(this.toIso(new Date()));
  }

  seleccionarDiaCal(iso: string | null) {
    if (!iso) return;
    this.fechaDia.setValue(iso);
  }

  mesCal(delta: number) {
    const d = this.parseFecha(this.fechaDia.value);
    d.setMonth(d.getMonth() + delta);
    this.fechaDia.setValue(this.toIso(d));
  }

  private setSedesFiltro(ids: number[], emit = true) {
    const clean = ids.map(Number).filter(Boolean);
    this.filtroSedes.set(clean);
    this.filtroSedesCtrl.setValue(clean, { emitEvent: emit });
  }

  seleccionarTodasSedes() {
    const ids = this.sedes().map((s) => Number(s.id_sede));
    if (!ids.length) return;
    this.setSedesFiltro(ids); // valueChanges ? recargar
    this.form.patchValue({ id_sede: ids[0] });
    this.cargarSalasEquipos(ids[0]);
  }

  seleccionarTodosEspecialistas() {
    this.filtroEspecialistas.set([]);
    this.filtroEspecialistasCtrl.setValue([]); // valueChanges ? refresca Semana
  }

  prefillDesdeSlot(iso: string) {
    this.fechaDia.setValue(iso);
  }

  cargarSalasEquipos(idSede: number) {
    this.sedesService.listSalas(idSede).subscribe({
      next: (res: any) => this.salas.set(res.data?.data || res.data || res || []),
    });
    this.sedesService.listEquipos(idSede).subscribe({
      next: (res: any) => this.equipos.set(res.data?.data || res.data || res || []),
    });
  }

  recargar() {
    const sedes = this.sedesSeleccionadas();
    const fecha = this.fechaDia.value;
    if (!sedes.length || !fecha) return;
    this.loading.set(true);

    forkJoin(
      sedes.map((id) =>
        this.service.dia(fecha, Number(id)).pipe(catchError(() => of(null))),
      ),
    ).subscribe({
      next: (resList: any[]) => {
        const payloads = resList
          .map((r) => r?.data || r)
          .filter((d) => !!d);
        if (!payloads.length) {
          this.loading.set(false);
          this.alert.error('No se pudo cargar la agenda del día');
          return;
        }
        this.dayData.set(this.mergeDiaPayloads(payloads, fecha));
        if (this.vista() === 'semana') {
          this.cargarSemana(sedes);
        } else {
          this.loading.set(false);
        }
      },
      error: () => {
        this.loading.set(false);
        this.alert.error('No se pudo cargar la agenda del día');
      },
    });
    this.cargarWaitlist();
  }

  private mergeDiaPayloads(payloads: any[], fecha: string) {
    const profMap = new Map<number, any>();
    const salasMap = new Map<number, any>();
    const equiposMap = new Map<number, any>();
    const citas: any[] = [];
    const citaIds = new Set<number>();

    for (const data of payloads) {
      for (const lane of data.lanes || []) {
        for (const item of lane.items || []) {
          const id = Number(item.id);
          if (lane.group === 'Profesionales') profMap.set(id, item);
          else if (lane.group === 'Salas') salasMap.set(id, item);
          else if (lane.group === 'Equipos') equiposMap.set(id, item);
        }
      }
      for (const c of data.citas || []) {
        const id = Number(c.id_cita);
        if (citaIds.has(id)) continue;
        citaIds.add(id);
        citas.push(c);
      }
    }

    citas.sort((a, b) => String(a.hora_inicio).localeCompare(String(b.hora_inicio)));

    return {
      fecha,
      id_sede: payloads[0]?.id_sede ?? null,
      day_start: payloads[0]?.day_start || '08:00',
      day_end: payloads[0]?.day_end || '19:00',
      lanes: [
        { group: 'Profesionales', items: [...profMap.values()] },
        { group: 'Salas', items: [...salasMap.values()] },
        { group: 'Equipos', items: [...equiposMap.values()] },
      ],
      citas,
    };
  }

  private cargarSemana(sedes: number[]) {
    const dias = this.semanaDias();
    const desde = dias[0]?.iso;
    const hasta = dias[6]?.iso;
    if (!desde || !hasta || !sedes.length) {
      this.loading.set(false);
      return;
    }
    const prof = this.profesionalSemana();
    // Cargar toda la sede; el filtro de especialista se aplica en citasSemanaDia
    forkJoin(
      sedes.map((id) =>
        this.service.semana(desde, hasta, Number(id), null).pipe(catchError(() => of(null))),
      ),
    ).subscribe({
      next: (resList: any[]) => {
        const payloads = resList.map((r) => r?.data || r).filter((d) => !!d);
        const citas: any[] = [];
        const seen = new Set<number>();
        const profMap = new Map<number, any>();
        for (const data of payloads) {
          for (const p of data.profesionales || []) profMap.set(Number(p.id), p);
          for (const c of data.citas || []) {
            const id = Number(c.id_cita);
            if (seen.has(id)) continue;
            seen.add(id);
            citas.push(c);
          }
        }
        citas.sort(
          (a, b) =>
            String(this.fechaIso(a.fecha_cita)).localeCompare(String(this.fechaIso(b.fecha_cita))) ||
            String(a.hora_inicio).localeCompare(String(b.hora_inicio)),
        );
        this.weekData.set({
          desde,
          hasta,
          id_sede: sedes[0],
          id_personal: prof?.id || null,
          day_start: '08:00',
          day_end: '19:00',
          profesionales: [...profMap.values()],
          citas: citas.map((c) => ({ ...c, fecha_cita: this.fechaIso(c.fecha_cita) })),
        });
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.alert.error('No se pudo cargar la semana');
      },
    });
  }

  cargarWaitlist() {
    const sedes = this.sedesSeleccionadas();
    if (!sedes.length) return;
    forkJoin(
      sedes.map((id) =>
        this.service
          .listaEspera({ id_sede: id, estado: 'PENDIENTE', page: 1, limit: 20 })
          .pipe(catchError(() => of({ data: [] }))),
      ),
    ).subscribe({
      next: (resList: any[]) => {
        const all: any[] = [];
        const seen = new Set<number>();
        for (const res of resList) {
          for (const w of res?.data?.data || res?.data || []) {
            const id = Number(w.id_lista_espera);
            if (seen.has(id)) continue;
            seen.add(id);
            all.push(w);
          }
        }
        this.waitlist.set(all);
      },
    });
  }

  cargarPaquetes(idPaciente: number) {
    this.service.paquetesPaciente(idPaciente).subscribe({
      next: (res: any) => this.paquetes.set(res.data?.data || res.data || res || []),
    });
  }

  abrirModalCita(
    tpl: TemplateRef<any>,
    prefill?: { hora?: string; id_personal?: number; id_paciente?: number; id_hd_paquete?: number },
  ) {
    this.editingCitaId.set(null);
    this.limpiarFormularioCita();
    const sede = this.sedeActiva();
    const hora = prefill?.hora ? prefill.hora.slice(0, 5) : '09:00';
    if (sede) this.form.patchValue({ id_sede: sede, fecha_cita: this.fechaDia.value });
    this.form.patchValue({
      hora_inicio: hora,
      id_personal: prefill?.id_personal || this.idPersonalDefault(),
      ...(prefill?.id_paciente ? { id_paciente: prefill.id_paciente } : {}),
    });
    this.horaInicioSel.set(hora);
    if (prefill?.id_hd_paquete) {
      this.planAceptadoId.set(Number(prefill.id_hd_paquete));
    }
    if (prefill?.id_paciente) this.asegurarPacienteEnLista(Number(prefill.id_paciente));
    this.modalCitaRef = this.modal.open(tpl, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      scrollable: true,
    });
  }

  ngAfterViewInit() {
    this.consumirQueryPrefillAgenda();
  }

  /** Prefill desde HD («Agendar»): abre modal con paciente/plan; no bloquea si falla el aviso. */
  private consumirQueryPrefillAgenda() {
    if (this.queryPrefillConsumido || !this.modalCitaTpl) return;
    const q = this.route.snapshot.queryParamMap;
    const idPac = Number(q.get('id_paciente') || 0);
    const idPlan = Number(q.get('id_hd_paquete') || 0);
    if (idPac <= 0) return;
    this.queryPrefillConsumido = true;
    void Promise.resolve().then(() => {
      if (!this.modalCitaTpl) return;
      this.abrirModalCita(this.modalCitaTpl, {
        id_paciente: idPac,
        id_hd_paquete: idPlan > 0 ? idPlan : undefined,
      });
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    });
  }

  onTipoProcedimientoChange(tipo: 'QUIRURGICO' | 'NO_QUIRURGICO' | null) {
    this.tipoProcedimientoSel.set(tipo);
    this.tipoProcedimientoCtrl.setValue(tipo, { emitEvent: false });
    this.form.patchValue({ ids_tratamiento: [] });
    this.idsTratamientoSel.set([]);
    this.validacion.set(null);
  }

  cerrarModalCita() {
    this.modalCitaRef?.dismiss();
    this.modalCitaRef = null;
  }

  /** Normaliza TIME / Date / ISO a HH:mm */
  parseHora(raw: unknown): string {
    if (raw == null || raw === '') return '09:00';
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      return `${String(raw.getHours()).padStart(2, '0')}:${String(raw.getMinutes()).padStart(2, '0')}`;
    }
    const s = String(raw);
    const m = s.match(/(\d{1,2}):(\d{2})/);
    if (m) return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
    return '09:00';
  }

  toMin(hora: string): number {
    const [h, m] = this.parseHora(hora).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  topPx(hora: string): number {
    return ((this.toMin(hora) - this.dayStartMin) / 60) * this.slotPx;
  }

  heightPx(horaIni: string, horaFin: string): number {
    const span = this.toMin(horaFin) - this.toMin(horaIni);
    // 30 min → 32px con slot 64; mínimo 44px para leer hora + paciente
    return Math.max(44, (Math.max(span, 15) / 60) * this.slotPx);
  }

  /** Fecha ISO yyyy-mm-dd desde Date/string (evita bug de Semana). */
  fechaIso(raw: unknown): string {
    if (raw == null || raw === '') return '';
    if (raw instanceof Date && !isNaN(raw.getTime())) return this.toIso(raw);
    const s = String(raw);
    const m = s.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(s);
    return !isNaN(d.getTime()) ? this.toIso(d) : s.slice(0, 10);
  }

  /**
   * Posiciona bloques solapados lado a lado.
   * Cada cita solo comparte ancho con las que se solapan en el mismo intervalo
   * (evita que una de 3h tape una corta a la misma hora).
   */
  layoutColumna(
    citas: any[],
  ): { cita: any; left: number; width: number; top: number; height: number; z: number }[] {
    const items = citas
      .map((c) => {
        const startH = this.parseHora(c.hora_inicio);
        const endH = this.parseHora(this.finBloque(c, 'prof'));
        return {
          cita: c,
          startH,
          endH,
          start: this.toMin(startH),
          end: this.toMin(endH),
        };
      })
      .filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start)
      .sort((a, b) => a.start - b.start || b.end - a.end || Number(a.cita.id_cita) - Number(b.cita.id_cita));

    // Asignar columna (primera libre que no solape)
    const colEnds: number[] = [];
    const placed: {
      cita: any;
      startH: string;
      endH: string;
      start: number;
      end: number;
      col: number;
    }[] = [];

    for (const it of items) {
      let col = colEnds.findIndex((end) => end <= it.start);
      if (col < 0) {
        col = colEnds.length;
        colEnds.push(it.end);
      } else {
        colEnds[col] = it.end;
      }
      placed.push({ ...it, col });
    }

    return placed.map((p) => {
      // Ancho según columnas concurrentes en el tramo de esta cita
      const peers = placed.filter((o) => o.start < p.end && o.end > p.start);
      const colsUsed = Math.max(1, ...peers.map((o) => o.col + 1));
      const widthPct = 100 / colsUsed;
      const gap = 1.2;
      // Citas más cortas encima (visibles al solaparse con bloques largos)
      const dur = Math.max(1, p.end - p.start);
      return {
        cita: p.cita,
        left: p.col * widthPct + gap / 2,
        width: Math.max(8, widthPct - gap),
        top: this.topPx(p.startH),
        height: this.heightPx(p.startH, p.endH),
        z: 10 + p.col + Math.max(0, 40 - Math.floor(dur / 15)),
      };
    });
  }

  citasDePersonal(idPersonal: number): any[] {
    return this.citasFiltradas().filter((c) => {
      if (Number(c.id_personal) === Number(idPersonal)) return true;
      return (c.participantes || []).some((p: any) => Number(p.id_personal) === Number(idPersonal));
    });
  }

  citasSemanaDia(iso: string): any[] {
    const citas = (this.weekData()?.citas || []) as any[];
    let list = citas.filter((c) => this.fechaIso(c.fecha_cita) === iso);
    const q = this.buscarPaciente.value.trim().toLowerCase();
    if (q) list = list.filter((c) => String(c.paciente || '').toLowerCase().includes(q));
    const fe = this.filtroEspecialistas();
    if (fe.length) {
      const allowed = new Set(fe.map(Number));
      list = list.filter((c) => {
        if (allowed.has(Number(c.id_personal))) return true;
        return (c.participantes || []).some((p: any) => allowed.has(Number(p.id_personal)));
      });
    }
    return list;
  }

  finBloque(c: any, kind: string): string {
    if (kind === 'prof') return this.parseHora(c.hora_fin);
    return this.parseHora(c.hora_fin_recurso || c.hora_fin);
  }

  /** Color sólido del bloque según estado */
  colorCita(c: any): string {
    const map: Record<string, string> = {
      PENDIENTE: '#C4A574',
      CONFIRMADA: '#4C6B8A',
      EN_ATENCION: '#C97F86',
      FINALIZADA: '#5B6960',
      CANCELADA: '#9AA0A6',
      NO_ASISTIO: '#B0A8A0',
      REPROGRAMADA: '#8B7E74',
    };
    return map[c?.estado] || c?.color_agenda || '#1F4E4A';
  }

  labelEstado(estado: string): string {
    const map: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      CONFIRMADA: 'Confirmada',
      EN_ATENCION: 'En atención',
      FINALIZADA: 'Finalizada',
      CANCELADA: 'Cancelada',
      NO_ASISTIO: 'No asistió',
      REPROGRAMADA: 'Reprogramada',
    };
    return map[estado] || estado;
  }

  indiceEstado(estado: string): number {
    return this.estadosFlujo.findIndex((x) => x.id === estado);
  }

  badgeClass(estado: string): string {
    const map: Record<string, string> = {
      PENDIENTE: 'badge-pend',
      CONFIRMADA: 'badge-conf',
      EN_ATENCION: 'badge-aten',
      FINALIZADA: 'badge-fin',
    };
    return map[estado] || 'badge-pend';
  }

  inicialesPaciente(c: any): string {
    const nom = String(c?.paciente_nombres || c?.paciente || '')
      .trim()
      .split(/\s+/);
    const ape = String(c?.paciente_apellidos || '')
      .trim()
      .split(/\s+/);
    const a = (ape[0] || nom[0] || '?').charAt(0);
    const b = (nom[0] || ape[1] || '?').charAt(0);
    return (a + b).toUpperCase();
  }

  nombrePacienteFmt(c: any): string {
    if (c?.paciente_apellidos || c?.paciente_nombres) {
      return `${c.paciente_apellidos || ''}, ${c.paciente_nombres || ''}`.trim().replace(/^,\s*/, '');
    }
    return c?.paciente || 'Paciente';
  }

  duracionMinutosCita(c: any): number {
    if (c?.duracion_minutos) return Number(c.duracion_minutos);
    const a = this.toMin(this.parseHora(c?.hora_inicio));
    const b = this.toMin(this.parseHora(c?.hora_fin));
    return Math.max(0, b - a);
  }

  fechaLarga(c: any): string {
    const iso = this.fechaIso(c?.fecha_cita);
    if (!iso) return '';
    const d = this.parseFecha(iso);
    return d.toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  mostrarTooltip(ev: MouseEvent, c: any) {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const left = Math.min(window.innerWidth - 320, rect.right + 8);
    const top = Math.max(8, rect.top);
    this.tooltipCita.set(c);
    this.tooltipStyle.set({
      display: 'block',
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      zIndex: '1080',
    });
  }

  ocultarTooltip() {
    this.tooltipCita.set(null);
    this.tooltipStyle.set({ display: 'none' });
  }

  sedeNombre(c: any): string {
    if (c?.sede_nombre) return c.sede_nombre;
    const s = this.sedes().find((x) => Number(x.id_sede) === Number(c?.id_sede));
    return s?.nombre || '—';
  }

  personalLabel(c: any): string {
    const nom = c?.personal || '';
    const esp = c?.personal_especialidad || c?.especialidad || '';
    return esp ? `${nom} · ${esp}` : nom || '—';
  }

  puedeIniciar(c: any): boolean {
    return ['PENDIENTE', 'CONFIRMADA'].includes(c?.estado);
  }

  labelCitaClinica(c: any): string {
    if (c?.estado === 'FINALIZADA' || c?.consulta_estado === 'FINALIZADA') return 'Ver cita clínica';
    if (c?.id_consulta) return 'Continuar cita clínica';
    return 'Registrar cita clínica';
  }

  irACitaClinica(modal: any) {
    const c = this.citaDetalle();
    if (!c?.id_cita || !c.id_paciente || !c.id_personal) return;
    const sede = c.id_sede || this.sedeActiva();
    const fecha = this.fechaCitaLocal(c);
    const abrir = () => {
      modal.dismiss();
      // Atención = wizard Anamnesis → EF → Diagnóstico → Plan
      this.router.navigate(['/historia-clinica'], {
        queryParams: {
          id_cita: c.id_cita,
          id_paciente: c.id_paciente,
          id_sede: sede,
          id_personal: c.id_personal,
          fecha: fecha || null,
          id_consulta: c.id_consulta || null,
        },
      });
    };
    if (this.puedeIniciar(c) && this.perms.hasPermission('actualizar_cita')) {
      this.service.cambiarEstado(c.id_cita, 'EN_ATENCION').subscribe({
        next: () => abrir(),
        error: () => abrir(),
      });
      return;
    }
    abrir();
  }

  private fechaCitaLocal(c: any): string {
    const raw = c?.fecha_cita;
    let day = '';
    if (typeof raw === 'string') day = raw.slice(0, 10);
    else if (raw instanceof Date) {
      const y = raw.getFullYear();
      const m = String(raw.getMonth() + 1).padStart(2, '0');
      const d = String(raw.getDate()).padStart(2, '0');
      day = `${y}-${m}-${d}`;
    }
    const hora = String(c?.hora_inicio || '09:00').slice(0, 5);
    return day ? `${day}T${hora}` : '';
  }

  puedeFinalizar(c: any): boolean {
    return ['PENDIENTE', 'CONFIRMADA', 'EN_ATENCION'].includes(c?.estado);
  }

  puedeCancelar(c: any): boolean {
    return !['FINALIZADA', 'CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA'].includes(c?.estado);
  }

  puedeEditar(c: any): boolean {
    return !['FINALIZADA', 'CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA'].includes(c?.estado);
  }

  puedeMarcarNoAsistio(c: any): boolean {
    return ['PENDIENTE', 'CONFIRMADA', 'EN_ATENCION'].includes(c?.estado);
  }

  cambiarEstadoCita(modal: any, estado: string) {
    const c = this.citaDetalle();
    if (!c) return;
    const run = () =>
      this.service.cambiarEstado(c.id_cita, estado).subscribe({
        next: (res: any) => {
          const body = res?.data || res || {};
          modal.close();
          this.alert.success(
            body?.message || `Cita: ${this.labelEstado(estado)}`,
          );
          this.recargar();
        },
        error: (e) => this.alert.error(e.error?.mensaje || 'No se pudo cambiar el estado'),
      });
    if (estado === 'NO_ASISTIO') {
      this.alert
        .confirmAction(
          '¿Paciente no asistió?',
          'Si la cita estaba ligada a una sesión del plan, esa sesión quedará libre para reprogramar.',
          'Sí, marcar',
        )
        .then((ok) => {
          if (ok) run();
        });
      return;
    }
    run();
  }

  payloadForm() {
    const raw = this.form.getRawValue();
    const tipo = this.tipoSel();
    const needTrat =
      tipo?.codigo === 'PROCEDIMIENTO' || !!Number(tipo?.requiere_tratamiento);
    const toId = (v: unknown) => (v == null || v === '' ? null : Number(v));
    const ids = needTrat
      ? (Array.isArray(raw.ids_tratamiento) ? raw.ids_tratamiento : [])
          .map((x: any) => Number(x))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      : [];
    const idPlan = this.planAceptadoId();
    return {
      id_sede: Number(raw.id_sede),
      id_tipo_cita: Number(raw.id_tipo_cita),
      id_paciente: Number(raw.id_paciente),
      id_personal: toId(raw.id_personal) || this.idPersonalDefault(),
      id_tratamiento: ids[0] || null,
      ids_tratamiento: ids,
      id_sala: null,
      id_equipo: null,
      id_hd_paquete: idPlan || null,
      fecha_cita: raw.fecha_cita,
      hora_inicio: raw.hora_inicio?.length === 5 ? raw.hora_inicio + ':00' : raw.hora_inicio,
      notas: raw.notas || null,
    };
  }

  /** Aviso informativo; 403/error ? sin toast ni bloqueo del guardado. */
  cargarPlanesPendientes(idPaciente: number) {
    this.planesPendientes.set([]);
    if (!this.esSorela() || !idPaciente) return;
    this.hdApi.sesionesPendientes(idPaciente).subscribe({
      next: (res: any) => {
        const body = res?.data?.planes ? res.data : res?.data?.data || res?.data || res;
        this.planesPendientes.set(Array.isArray(body?.planes) ? body.planes : []);
      },
      error: () => this.planesPendientes.set([]),
    });
  }

  /** Interruptor de formulario: solo afecta el payload al guardar (create). */
  ligarPlanPendiente(p: any) {
    this.planAceptadoId.set(Number(p.id_hd_paquete));
  }

  quitarVinculoPlan() {
    this.planAceptadoId.set(null);
  }

  limpiarFormularioCita() {
    const sede = this.form.get('id_sede')?.value || this.sedeActiva();
    const fecha = this.fechaDia.value;
    const consulta =
      this.tiposCita().find((t) => t.codigo === 'CONSULTA') || this.tiposCita()[0] || null;
    const tipoId = consulta?.id_tipo_cita ?? this.form.get('id_tipo_cita')?.value;
    this.form.reset({
      id_sede: sede,
      id_tipo_cita: tipoId,
      id_paciente: null,
      id_personal: this.idPersonalDefault(),
      ids_tratamiento: [],
      fecha_cita: fecha,
      hora_inicio: '09:00',
      notas: '',
    });
    this.tipoSel.set(consulta);
    this.tipoProcedimientoSel.set(null);
    this.tipoProcedimientoCtrl.setValue(null, { emitEvent: false });
    this.idsTratamientoSel.set([]);
    this.horaInicioSel.set('09:00');
    this.validacion.set(null);
    this.ponerSugerencia(null);
    this.paquetes.set([]);
    this.planesPendientes.set([]);
    this.planAceptadoId.set(null);
  }

  private ponerSugerencia(hora: string | null) {
    this.sugerencia.set(hora);
    this.sugerenciaAceptada.set(false);
  }

  validar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.alert.showLoading('Validando...');
    this.ponerSugerencia(null);
    this.service.validar(this.payloadForm()).subscribe({
      next: (res: any) => {
        this.alert.closeLoading();
        const data = res.data || res;
        this.validacion.set(data);
        if (!data.ok && !data.valida) {
          this.service.sugerirHorario(this.payloadForm()).subscribe({
            next: (s: any) => {
              const sug = s.data || s;
              this.ponerSugerencia(sug.encontrado ? sug.hora_inicio : null);
            },
          });
        }
      },
      error: (err) => {
        this.alert.closeLoading();
        const data = err.error?.data || err.error;
        if (data?.steps) this.validacion.set(data);
        else this.alert.error(err.error?.mensaje || 'Validación fallida');
      },
    });
  }

  agendar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const editId = this.editingCitaId();
    this.alert.showLoading(editId ? 'Actualizando...' : 'Agendando...');
    const req$ = editId
      ? this.service.update(editId, this.payloadForm())
      : this.service.create(this.payloadForm());
    req$.subscribe({
      next: (res: any) => {
        this.alert.closeLoading();
        const data = res.data || res;
        this.validacion.set(data);
        this.alert.success(editId ? 'Cita actualizada' : 'Cita creada');
        this.editingCitaId.set(null);
        this.limpiarFormularioCita();
        this.cerrarModalCita();
        this.recargar();
      },
      error: (err) => {
        this.alert.closeLoading();
        const data = err.error?.data || err.error;
        if (data?.steps) {
          this.validacion.set(data);
          const fail = (data.steps || []).find((s: any) => !s.pass);
          this.alert.error(err.error?.mensaje || fail?.msg || 'No se pudo guardar');
          this.service.sugerirHorario(this.payloadForm()).subscribe({
            next: (s: any) => {
              const sug = s.data || s;
              this.ponerSugerencia(sug.encontrado ? sug.hora_inicio : null);
            },
          });
        } else {
          this.alert.error(err.error?.mensaje || 'No se pudo guardar');
        }
      },
    });
  }

  aceptarSugerencia() {
    const h = this.sugerencia();
    if (!h) return;
    const hora = String(h).slice(0, 5);
    this.form.patchValue({ hora_inicio: hora });
    this.horaInicioSel.set(hora);
    this.sugerenciaAceptada.set(true);
  }

  cancelarSugerencia() {
    this.ponerSugerencia(null);
  }

  agregarEspera() {
    const raw = this.form.getRawValue();
    const ids = Array.isArray(raw.ids_tratamiento) ? raw.ids_tratamiento : [];
    if (!raw.id_paciente || !raw.id_sede || !ids.length) {
      this.alert.warning('Indique paciente, sede y procedimiento');
      return;
    }
    this.service
      .addListaEspera({
        id_sede: raw.id_sede,
        id_paciente: raw.id_paciente,
        id_tratamiento: Number(ids[0]) || null,
        fecha_preferida: raw.fecha_cita,
      })
      .subscribe({
        next: () => {
          this.alert.success('Agregado a lista de espera');
          this.cargarWaitlist();
        },
        error: (e) => this.alert.error(e.error?.mensaje || 'No se pudo agregar'),
      });
  }

  abrirDetalle(c: any, tpl: TemplateRef<any>) {
    this.ocultarTooltip();
    this.service.findOne(c.id_cita).subscribe({
      next: (res: any) => {
        this.citaDetalle.set({ ...c, ...(res.data || res) });
        this.modalDetalleRef = this.modal.open(tpl, {
          centered: true,
          size: 'md',
          windowClass: 'cita-detalle-modal',
        });
      },
    });
  }

  editarCitaDesdeDetalle(modal: any, tplCita: TemplateRef<any>) {
    const c = this.citaDetalle();
    if (!c) return;
    modal.dismiss();
    this.editingCitaId.set(Number(c.id_cita));
    this.validacion.set(null);
    this.ponerSugerencia(null);

    const tipo =
      this.tiposCita().find((t) => Number(t.id_tipo_cita) === Number(c.id_tipo_cita)) || null;
    this.tipoSel.set(tipo);

    const procs = Array.isArray(c.procedimientos) ? c.procedimientos : [];
    const ids = procs.length
      ? procs.map((p: any) => Number(p.id_tratamiento)).filter((n: number) => n > 0)
      : c.id_tratamiento
        ? [Number(c.id_tratamiento)]
        : [];

    // Inferir QUIRURGICO / NO_QUIRURGICO desde la cita o el catálogo
    let tp: 'QUIRURGICO' | 'NO_QUIRURGICO' | null = null;
    const esProc =
      tipo?.codigo === 'PROCEDIMIENTO' || !!Number(tipo?.requiere_tratamiento);
    if (esProc && ids.length) {
      const fromProc = String(procs[0]?.tipo_procedimiento || '')
        .toUpperCase()
        .trim();
      if (fromProc === 'QUIRURGICO' || fromProc === 'NO_QUIRURGICO') {
        tp = fromProc;
      } else {
        const first = this.tratamientos().find((t) => Number(t.id_tratamiento) === ids[0]);
        const fromCat = String(first?.tipo_procedimiento || '')
          .toUpperCase()
          .trim();
        if (fromCat === 'QUIRURGICO' || fromCat === 'NO_QUIRURGICO') tp = fromCat;
      }
    }

    // emitEvent:false evita que valueChanges de id_tipo_cita limpie tipo/procedimientos
    this.form.patchValue(
      {
        id_sede: c.id_sede,
        id_tipo_cita: c.id_tipo_cita,
        id_paciente: c.id_paciente,
        id_personal: c.id_personal,
        ids_tratamiento: ids,
        fecha_cita: this.fechaIso(c.fecha_cita),
        hora_inicio: this.parseHora(c.hora_inicio),
        notas: c.notas || '',
      },
      { emitEvent: false },
    );

    this.tipoProcedimientoSel.set(tp);
    this.tipoProcedimientoCtrl.setValue(tp, { emitEvent: false });
    this.idsTratamientoSel.set(ids);
    this.horaInicioSel.set(this.parseHora(c.hora_inicio));

    if (c.id_paciente) this.cargarPaquetes(Number(c.id_paciente));
    if (c.id_sede) this.cargarSalasEquipos(Number(c.id_sede));

    this.modalCitaRef = this.modal.open(tplCita, {
      centered: true,
      size: 'lg',
      backdrop: 'static',
      scrollable: true,
    });
  }

  cancelarCita(modal: any) {
    const c = this.citaDetalle();
    if (!c) return;
    this.alert.confirmAction('¿Cancelar cita?', 'Se liberarán los recursos.', 'Sí, cancelar').then((ok) => {
      if (!ok) return;
      this.service.cancelar(c.id_cita, 'Cancelación desde agenda').subscribe({
        next: (res: any) => {
          const data = res.data || res;
          modal.close();
          this.alert.success(
            data.reasignado
              ? 'Cita cancelada y reasignada desde lista de espera'
              : data.penalidad_aplicada
                ? 'Cita cancelada (penalidad <24h marcada)'
                : 'Cita cancelada',
          );
          this.recargar();
        },
        error: (e) => this.alert.error(e.error?.mensaje || 'Error al cancelar'),
      });
    });
  }

  esSorela(): boolean {
    const codigo = this.unidad.membresias().find((m) => m.id_unidad === this.unidad.idUnidad())?.codigo;
    return String(codigo || '').toUpperCase() === 'SORELA';
  }

  atenderCita(modal: any) {
    if (this.citaDetalle()?.estado === 'FINALIZADA') {
      this.alert.warning('Esta cita ya está finalizada.');
      return;
    }
    if (!this.esSorela()) {
      this.irACitaClinica(modal);
      return;
    }
    const c = this.citaDetalle();
    if (!c?.id_cita) return;
    const abrir = () => {
      modal.dismiss();
      this.router.navigate(['/citas', c.id_cita, 'atencion']);
    };
    if (this.puedeIniciar(c) && this.perms.hasPermission('actualizar_cita')) {
      this.service.cambiarEstado(c.id_cita, 'EN_ATENCION').subscribe({
        next: () => abrir(),
        error: () => abrir(),
      });
      return;
    }
    abrir();
  }

  copiarTelefono(tel: string) {
    if (!tel) return;
    navigator.clipboard?.writeText(tel).then(
      () => this.alert.success('Teléfono copiado'),
      () => this.alert.warning('No se pudo copiar'),
    );
  }

  completarCita(modal: any) {
    const c = this.citaDetalle();
    if (!c) return;
    this.service.completar(c.id_cita).subscribe({
      next: () => {
        modal.close();
        this.alert.success('Cita finalizada');
        this.recargar();
      },
      error: (e) => this.alert.error(e.error?.mensaje || 'Error al finalizar'),
    });
  }

  labelPaciente = (p: any) => {
    if (!p) return '';
    const nom = `${p.apellidos || ''}, ${p.nombres || ''}`.replace(/^,\s*/, '').trim();
    const doc = p.numero_documento ? ` · ${p.tipo_documento || 'DNI'} ${p.numero_documento}` : '';
    return `${nom}${doc}`;
  };

  /** Filtra por nombre, apellido o DNI (ng-select busca solo bindLabel por defecto). */
  filtrarPaciente = (term: string, item: any): boolean => {
    const q = this.normalizarTexto(term);
    if (!q) return true;
    const hay = this.normalizarTexto(
      [item?.label, item?.nombres, item?.apellidos, item?.numero_documento].filter(Boolean).join(' '),
    );
    return hay.includes(q);
  };

  labelPersonal = (p: any) =>
    p
      ? `${p.apellidos || ''} ${p.nombres || ''}`.trim() +
        (p.especialidad ? ` · ${p.especialidad}` : '')
      : '';

  private mapPacientes(list: any[]) {
    return (list || []).map((p: any) => ({ ...p, label: this.labelPaciente(p) }));
  }

  private normalizarTexto(v: unknown): string {
    return String(v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  private asegurarPacienteEnLista(id: number) {
    if (!id || this.pacientes().some((p) => Number(p.id_paciente) === id)) return;
    this.pacientesService.findOne(id).subscribe({
      next: (res: any) => {
        const p = res?.data?.data || res?.data || res;
        if (!p?.id_paciente) return;
        this.pacientes.update((list) => [{ ...p, label: this.labelPaciente(p) }, ...list]);
      },
      error: () => undefined,
    });
  }

  trackCita = (_: number, c: any) => c.id_cita;

  private parseFecha(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private toIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  esHoy(iso: string | null): boolean {
    return !!iso && iso === this.toIso(new Date());
  }

  esSeleccionado(iso: string | null): boolean {
    return !!iso && iso === this.fechaDia.value;
  }

  gridHeightPx(): number {
    return ((this.dayEndMin - this.dayStartMin) / 60) * this.slotPx;
  }
}
