import {
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
  signal,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, filter, switchMap, catchError, of } from 'rxjs';

import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { SedeContextService } from 'src/app/core/services/sede-context.service';
import { PacientesService } from '../pacientes/pacientes.service';
import { PersonalService } from '../personal/personal.service';
import { SedesService } from '../sedes/sedes.service';
import { HistoriaClinicaService } from './historia-clinica.service';
import { AgendaService } from '../agenda/agenda.service';
import { MapaCorporalComponent } from '../mapa-corporal/mapa-corporal.component';
import { MapaCorporalService } from '../mapa-corporal/mapa-corporal.service';

@Component({
  selector: 'app-historia-clinica',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    FormErrorComponent,
    NgSelectModule,
    MapaCorporalComponent,
  ],
  templateUrl: './historia-clinica.component.html',
  styleUrl: './historia-clinica.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoriaClinicaComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(HistoriaClinicaService);
  private pacientesService = inject(PacientesService);
  private personalService = inject(PersonalService);
  private sedesService = inject(SedesService);
  private sedeCtx = inject(SedeContextService);
  private alert = inject(AlertService);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private agenda = inject(AgendaService);
  private mapaService = inject(MapaCorporalService);
  public perms = inject(PermissionsService);

  readonly cie10Typeahead$ = new Subject<string>();
  readonly medTypeahead$ = new Subject<string>();
  readonly pacTypeahead$ = new Subject<string>();

  form!: FormGroup;
  pacientes = signal<any[]>([]);
  pacientesLoading = signal(false);
  personal = signal<any[]>([]);
  sedes = signal<any[]>([]);
  plantillas = signal<any[]>([]);
  cie10Options = signal<any[]>([]);
  medOptions = signal<any[]>([]);
  diagnosticos = signal<any[]>([]);
  dxManual = signal('');
  /** Marcadores del cuerpo 3D del paciente, visibles en Examen físico */
  marcadoresCuerpo = signal<any[]>([]);
  historial = signal<any[]>([]);
  saving = signal(false);
  expandedHist = signal<number | null>(null);
  citaVinculo = signal<number | null>(null);
  idConsulta = signal<number | null>(null);
  consultaCerrada = signal(false);
  /** Wizard Atención: Anamnesis → EF → Diagnóstico → Plan → Mapa */
  paso = signal<'anam' | 'ef' | 'diag' | 'plan' | 'mapa'>('anam');
  readonly pasos = [
    { id: 'anam' as const, corto: 'ANAM', label: 'Anamnesis' },
    { id: 'ef' as const, corto: 'EF', label: 'Examen Físico' },
    { id: 'diag' as const, corto: 'DIAG', label: 'Diagnóstico' },
    { id: 'plan' as const, corto: 'Plan', label: 'Plan' },
    { id: 'mapa' as const, corto: 'MAPA', label: 'Mapa 3D' },
  ];

  tiposEnfermedad = [
    { id: 'Agudo', nombre: 'Agudo' },
    { id: 'Subagudo', nombre: 'Subagudo' },
    { id: 'Crónico', nombre: 'Crónico' },
    { id: 'Constitucional', nombre: 'Constitucional' },
  ];
  tiposDx = [
    { id: 'PRESUNTIVO', nombre: 'Presuntivo' },
    { id: 'DEFINITIVO', nombre: 'Definitivo' },
    { id: 'RECURRENTE', nombre: 'Recurrente' },
  ];
  vias = ['Oral', 'IV', 'IM', 'SC', 'Tópica', 'Inhalatoria', 'Sublingual', 'Rectal'];

  imcVal = signal<number | null>(null);

  sistemasCatalogo = [
    'CARDIOVASCULAR',
    'TÓRAX Y PULMONES',
    'ABDOMEN',
    'OSTEOMUSCULAR',
    'NEUROLÓGICO',
    'GENITOURINARIO Y REPRODUCTOR',
    'GINECOLÓGICO Y MAMAS',
  ];

  anatomicosCatalogo = [
    'CARA ANTERIOR',
    'CARA LATERAL',
    'CABEZA POSTERIOR',
    'CUERPO ANTERIOR',
    'CUERPO LATERAL',
    'CUERPO POSTERIOR',
    'ABDOMEN',
    'TESTÍCULOS',
  ];

  ngOnInit() {
    this.form = this.fb.group({
      id_paciente: [null, Validators.required],
      id_sede: [this.sedeCtx.idSedeFiltro(), Validators.required],
      id_personal: [null, Validators.required],
      id_cita: [null],
      id_plantilla_clinica: [null],
      fecha_consulta: [new Date().toISOString().slice(0, 16), Validators.required],
      motivo_consulta: [''],
      tiempo_enfermedad: [''],
      tipo_enfermedad: [null],
      relato: [''],
      adjuntos_nota: [''],
      examen: this.fb.group({
        peso: [null],
        talla: [null],
        estado_mental: [''],
        estado_general: [''],
        pa_sistolica: [null],
        pa_diastolica: [null],
        fc: [null],
        fr: [null],
        sat_o2: [null],
        temperatura: [null],
        sistemas: this.fb.group(
          Object.fromEntries(this.sistemasCatalogo.map((s) => [s, ['']])),
        ),
        anatomicos: this.fb.group(
          Object.fromEntries(this.anatomicosCatalogo.map((s) => [s, ['']])),
        ),
      }),
      apreciacion: [''],
      plan_indicaciones: [''],
      medicamentos: this.fb.array([]),
    });

    this.pacTypeahead$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        filter((t) => (t || '').trim().length >= 2),
        switchMap((term) => {
          this.pacientesLoading.set(true);
          return this.pacientesService.findAll(1, 50, term.trim()).pipe(
            catchError(() => of({ data: { data: [] } })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res: any) => {
        this.pacientesLoading.set(false);
        const list = (res.data?.data || res.data || []).map((p: any) => ({
          ...p,
          label: this.labelPaciente(p),
        }));
        // Conservar el paciente ya seleccionado si no viene en el resultado
        const selectedId = this.form?.get('id_paciente')?.value;
        if (selectedId && !list.some((p: any) => Number(p.id_paciente) === Number(selectedId))) {
          const prev = this.pacientes().find((p) => Number(p.id_paciente) === Number(selectedId));
          if (prev) list.unshift(prev);
        }
        this.pacientes.set(list);
      });

    this.cie10Typeahead$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        filter((t) => (t || '').trim().length >= 2),
        switchMap((term) =>
          this.service.buscarCie10(term.trim()).pipe(catchError(() => of({ data: [] }))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res: any) => this.cie10Options.set(res.data?.data || res.data || res || []));

    this.medTypeahead$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        filter((t) => (t || '').trim().length >= 2),
        switchMap((term) =>
          this.service.buscarMedicamentos(term.trim()).pipe(catchError(() => of([]))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res: any) => this.medOptions.set(res.data?.data || res.data || res || []));

    this.form.get('id_paciente')?.valueChanges.subscribe((id) => {
      if (id) {
        this.cargarHistorial(Number(id));
        this.asegurarPacienteEnLista(Number(id));
        this.cargarMarcadoresCuerpo(Number(id));
      } else {
        this.historial.set([]);
        this.marcadoresCuerpo.set([]);
      }
    });

    this.form.get('examen.peso')?.valueChanges.subscribe(() => this.recalcImc());
    this.form.get('examen.talla')?.valueChanges.subscribe(() => this.recalcImc());

    this.personalService.findAll(1, 200, '').subscribe({
      next: (res: any) => this.personal.set(res.data?.data || res.data || []),
    });
    this.sedesService.findAll(1, 100, '').subscribe({
      next: (res: any) => this.sedes.set(res.data?.data || res.data || []),
    });
    this.service.listPlantillas().subscribe({
      next: (res: any) => this.plantillas.set(res.data?.data || res.data || []),
      error: () => this.plantillas.set([]),
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => {
      this.aplicarParametrosCita(q);
    });
  }

  private aplicarParametrosCita(q: { get: (name: string) => string | null }) {
    const idCita = Number(q.get('id_cita') || 0);
    const idConsulta = Number(q.get('id_consulta') || 0);
    const idPaciente = Number(q.get('id_paciente') || 0);
    const idSede = Number(q.get('id_sede') || 0);
    const idPersonal = Number(q.get('id_personal') || 0);
    const fecha = q.get('fecha') || '';
    if (!idCita && !idConsulta) return;

    if (this.consultaCerrada()) this.form.enable();
    this.consultaCerrada.set(false);
    this.citaVinculo.set(idCita || null);
    this.form.patchValue({
      id_cita: idCita || null,
      id_paciente: idPaciente || this.form.get('id_paciente')?.value,
      id_sede: idSede || this.form.get('id_sede')?.value,
      id_personal: idPersonal || this.form.get('id_personal')?.value,
      fecha_consulta: fecha ? fecha.slice(0, 16) : this.form.get('fecha_consulta')?.value,
    });
    if (idPaciente) this.asegurarPacienteEnLista(idPaciente);
    if (idConsulta) this.cargarConsulta(idConsulta);
    else if (idCita) this.buscarConsultaDeCita(idCita);
  }

  private buscarConsultaDeCita(idCita: number) {
    this.service.findAll(1, 1, '', { id_cita: idCita }).subscribe({
      next: (res: any) => {
        const row = (res.data?.data || res.data || [])[0];
        if (row?.id_consulta) this.cargarConsulta(Number(row.id_consulta));
      },
    });
  }

  private cargarConsulta(id: number) {
    this.service.findOne(id).subscribe({
      next: (res: any) => {
        const c = res.data?.data || res.data;
        if (c) this.aplicarConsulta(c);
      },
    });
  }

  private aplicarConsulta(c: any) {
    this.idConsulta.set(Number(c.id_consulta));
    if (c.id_cita) this.citaVinculo.set(Number(c.id_cita));
    const cerrada = c.estado === 'FINALIZADA' || c.estado === 'ANULADA';
    this.consultaCerrada.set(cerrada);
    const ex = c.examen_json || {};
    const fecha = String(c.fecha_consulta || '').replace(' ', 'T').slice(0, 16);
    this.form.patchValue({
      id_paciente: c.id_paciente,
      id_sede: c.id_sede,
      id_personal: c.id_personal,
      id_cita: c.id_cita || null,
      id_plantilla_clinica: c.id_plantilla_clinica,
      fecha_consulta: fecha || this.form.get('fecha_consulta')?.value,
      motivo_consulta: c.motivo_consulta || '',
      tiempo_enfermedad: c.tiempo_enfermedad || '',
      tipo_enfermedad: c.tipo_enfermedad || null,
      relato: c.relato || '',
      apreciacion: c.apreciacion || '',
      plan_indicaciones: c.plan?.indicaciones_generales || '',
      adjuntos_nota: Array.isArray(c.adjuntos_json) ? c.adjuntos_json[0]?.nota || '' : '',
      examen: {
        peso: ex.peso ?? null,
        talla: ex.talla ?? null,
        estado_mental: ex.estado_mental || '',
        estado_general: ex.estado_general || '',
        pa_sistolica: ex.pa_sistolica ?? null,
        pa_diastolica: ex.pa_diastolica ?? null,
        fc: ex.fc ?? null,
        fr: ex.fr ?? null,
        sat_o2: ex.sat_o2 ?? null,
        temperatura: ex.temperatura ?? null,
        sistemas: {
          ...Object.fromEntries(this.sistemasCatalogo.map((s) => [s, ''])),
          ...(ex.sistemas || {}),
        },
        anatomicos: {
          ...Object.fromEntries(this.anatomicosCatalogo.map((s) => [s, ''])),
          ...(ex.anatomicos || {}),
        },
      },
    });
    this.diagnosticos.set(c.diagnosticos || []);
    while (this.medicamentosFA.length) this.medicamentosFA.removeAt(0);
    for (const m of c.plan?.medicamentos || []) {
      this.medicamentosFA.push(
        this.fb.group({
          id_medicamento: [m.id_medicamento || null],
          medicamento: [m.medicamento || '', Validators.required],
          dosis: [m.dosis || ''],
          via: [m.via || 'Oral'],
          frecuencia: [m.frecuencia || ''],
          duracion: [m.duracion || ''],
          indicaciones: [m.indicaciones || ''],
        }),
      );
    }
    this.recalcImc();
    if (c.id_paciente) this.asegurarPacienteEnLista(Number(c.id_paciente));
    if (cerrada) this.form.disable({ emitEvent: false });
    else if (this.form.disabled) this.form.enable({ emitEvent: false });
  }

  /** Si el id seleccionado no está en items del ng-select, lo carga para mostrar etiqueta */
  private asegurarPacienteEnLista(id: number) {
    if (this.pacientes().some((p) => Number(p.id_paciente) === id)) return;
    this.pacientesService.findOne(id).subscribe({
      next: (res: any) => {
        const p = res.data?.data || res.data;
        if (!p) return;
        this.pacientes.update((list) => [
          { ...p, label: this.labelPaciente(p) },
          ...list.filter((x) => Number(x.id_paciente) !== id),
        ]);
      },
    });
  }

  private recalcImc() {
    const peso = Number(this.form.get('examen.peso')?.value);
    const tallaCm = Number(this.form.get('examen.talla')?.value);
    if (!peso || !tallaCm) {
      this.imcVal.set(null);
      return;
    }
    const tallaM = tallaCm / 100;
    this.imcVal.set(Math.round((peso / (tallaM * tallaM)) * 10) / 10);
  }

  get medicamentosFA(): FormArray {
    return this.form.get('medicamentos') as FormArray;
  }

  aplicarPlantilla(id: number | null) {
    this.form.patchValue({ id_plantilla_clinica: id });
    if (!id) return;
    const p = this.plantillas().find((x) => Number(x.id_plantilla_clinica) === Number(id));
    if (!p) return;
    const e = typeof p.estructura_json === 'string' ? JSON.parse(p.estructura_json) : p.estructura_json || {};
    this.form.patchValue({
      motivo_consulta: e.motivo || this.form.value.motivo_consulta,
      tiempo_enfermedad: e.tiempo_enfermedad || '',
      tipo_enfermedad: e.tipo_enfermedad || null,
      relato: e.relato || '',
    });
  }

  cargarHistorial(idPaciente: number) {
    this.service.historialPaciente(idPaciente).subscribe({
      next: (res: any) => this.historial.set(res.data?.data || res.data || []),
      error: () => this.historial.set([]),
    });
  }

  agregarDiagnostico(item: any) {
    if (!item) return;
    const idSub = item.id_cie10_subcategoria ?? item.id_cie10 ?? null;
    const ya = this.diagnosticos().some(
      (d) =>
        (idSub && (d.id_cie10_subcategoria === idSub || d.id_cie10 === idSub)) ||
        d.codigo_cie10 === item.codigo,
    );
    if (ya) return;
    this.diagnosticos.update((list) => [
      ...list,
      {
        id_cie10: null,
        id_cie10_subcategoria: idSub,
        codigo_cie10: item.codigo,
        descripcion: item.descripcion || item.nombre,
        tipo: 'PRESUNTIVO',
      },
    ]);
  }

  agregarDxLibre(texto: string) {
    const t = (texto || '').trim();
    if (!t) return;
    const ya = this.diagnosticos().some(
      (d) => !d.codigo_cie10 && String(d.descripcion || '').trim().toLowerCase() === t.toLowerCase(),
    );
    if (ya) {
      this.alert.warning('Ese diagnóstico ya está en la lista.');
      return;
    }
    this.diagnosticos.update((list) => [
      ...list,
      { id_cie10: null, id_cie10_subcategoria: null, codigo_cie10: null, descripcion: t, tipo: 'PRESUNTIVO' },
    ]);
  }

  confirmarDxLibre() {
    this.agregarDxLibre(this.dxManual());
    this.dxManual.set('');
  }

  setTipoDx(idx: number, tipo: string) {
    this.diagnosticos.update((list) =>
      list.map((d, i) => (i === idx ? { ...d, tipo } : d)),
    );
  }

  quitarDiagnostico(idx: number) {
    this.diagnosticos.update((list) => list.filter((_, i) => i !== idx));
  }

  agregarMedicamento(item?: any) {
    this.medicamentosFA.push(
      this.fb.group({
        id_medicamento: [item?.id_medicamento || null],
        medicamento: [
          item
            ? `${item.nombre}${item.concentracion ? ' ' + item.concentracion : ''}`
            : '',
          Validators.required,
        ],
        dosis: [''],
        via: ['Oral'],
        frecuencia: [''],
        duracion: [''],
        indicaciones: [''],
      }),
    );
  }

  quitarMedicamento(idx: number) {
    this.medicamentosFA.removeAt(idx);
  }

  onMedSelect(item: any) {
    if (!item) return;
    this.agregarMedicamento(item);
  }

  resumenExamen(): string {
    const e = this.form.get('examen')?.getRawValue() || {};
    const parts: string[] = [];
    if (e.peso || e.talla) {
      parts.push(`Peso ${e.peso || '—'} kg / Talla ${e.talla || '—'} cm / IMC ${this.imcVal() ?? '—'}`);
    }
    if (e.pa_sistolica || e.pa_diastolica) {
      parts.push(`PA ${e.pa_sistolica || '—'}/${e.pa_diastolica || '—'} mmHg`);
    }
    if (e.fc) parts.push(`FC ${e.fc} lpm`);
    if (e.fr) parts.push(`FR ${e.fr} rpm`);
    if (e.sat_o2) parts.push(`SatO2 ${e.sat_o2}%`);
    if (e.temperatura) parts.push(`T° ${e.temperatura}°C`);
    if (e.estado_general) parts.push(`EG: ${e.estado_general}`);
    return parts.join(' · ') || 'Sin hallazgos registrados.';
  }

  cargarMarcadoresCuerpo(idPaciente: number) {
    this.mapaService.list(idPaciente).subscribe({
      next: (res: any) => {
        const raw = res?.data?.data ?? res?.data ?? res;
        const list = Array.isArray(raw) ? raw : [];
        this.marcadoresCuerpo.set(list);
      },
      error: () => this.marcadoresCuerpo.set([]),
    });
  }

  guardar() {
    if (this.consultaCerrada()) {
      this.alert.warning('Esta cita clínica ya está finalizada');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.alert.warning('Complete paciente, sede, profesional y fecha');
      return;
    }
    if (!this.diagnosticos().length) {
      this.alert.warning('Agregue al menos un diagnóstico');
      return;
    }
    const idPac = Number(this.form.get('id_paciente')?.value || 0);
    this.mapaService.list(idPac).subscribe({
      next: (res: any) => {
        const raw = res?.data?.data ?? res?.data ?? res;
        this.marcadoresCuerpo.set(Array.isArray(raw) ? raw : []);
        this.persistirConsulta();
      },
      error: () => {
        this.marcadoresCuerpo.set([]);
        this.persistirConsulta();
      },
    });
  }

  private persistirConsulta() {
    const raw = this.form.getRawValue();
    const examen = raw.examen;
    const payload = {
      id_paciente: Number(raw.id_paciente),
      id_sede: Number(raw.id_sede),
      id_personal: Number(raw.id_personal),
      id_cita: raw.id_cita ? Number(raw.id_cita) : null,
      id_plantilla_clinica: raw.id_plantilla_clinica || null,
      fecha_consulta: raw.fecha_consulta,
      motivo_consulta: raw.motivo_consulta,
      tiempo_enfermedad: raw.tiempo_enfermedad || null,
      tipo_enfermedad: raw.tipo_enfermedad || null,
      relato: raw.relato || null,
      anamnesis: [
        raw.tiempo_enfermedad ? `TE: ${raw.tiempo_enfermedad}` : '',
        raw.tipo_enfermedad ? `Tipo: ${raw.tipo_enfermedad}` : '',
        raw.relato || '',
      ]
        .filter(Boolean)
        .join('\n'),
      examen_fisico: this.resumenExamen(),
      apreciacion: raw.apreciacion || null,
      examen_json: {
        ...examen,
        imc: this.imcVal(),
        marcadores: this.marcadoresCuerpo().map((m) => ({
          zona: m.zona_label || m.zona_codigo,
          lado: m.lado,
          procedimiento: m.procedimiento,
          estado: m.estado,
          notas: m.notas || null,
          fecha_plan: m.fecha_plan || null,
        })),
      },
      adjuntos_json: raw.adjuntos_nota
        ? [{ nota: raw.adjuntos_nota }]
        : null,
      diagnosticos: this.diagnosticos(),
      plan: {
        indicaciones_generales: raw.plan_indicaciones || null,
        medicamentos: (raw.medicamentos || []).filter((m: any) => m.medicamento),
      },
    };

    this.saving.set(true);
    this.alert.showLoading('Guardando atención…');
    const idExistente = this.idConsulta();
    const req = idExistente ? this.service.update(idExistente, payload) : this.service.create(payload);
    req.subscribe({
      next: (res: any) => {
        const id = idExistente || res.data?.id || res.id;
        const idCita = payload.id_cita;
        const irHistoria = () => {
          this.alert.closeLoading();
          this.saving.set(false);
          this.router.navigate(['/atencion-paciente'], {
            queryParams: {
              id_paciente: payload.id_paciente,
              id_cita: idCita || null,
              id_consulta: id || null,
              tab: 'atenciones',
            },
          });
        };
        if (id && this.perms.hasPermission('actualizar_historia_clinica')) {
          this.service.finalizar(id).subscribe({
            next: (fin: any) => {
              const nPdfs = fin?.data?.pdfs?.length || fin?.pdfs?.length || 0;
              this.alert.success(
                nPdfs
                  ? `Atención finalizada. Se generaron ${nPdfs} PDF(s).`
                  : 'Atención finalizada',
              );
              irHistoria();
            },
            error: (e) => {
              this.alert.closeLoading();
              this.saving.set(false);
              this.alert.error(e.error?.mensaje || 'Guardado, pero no se pudo finalizar');
            },
          });
        } else {
          this.alert.success('Consulta guardada');
          irHistoria();
        }
      },
      error: (err) => {
        this.alert.closeLoading();
        this.saving.set(false);
        this.alert.error(err.error?.mensaje || 'No se pudo guardar');
      },
    });
  }

  indicePaso(): number {
    return this.pasos.findIndex((x) => x.id === this.paso());
  }

  setPaso(p: 'anam' | 'ef' | 'diag' | 'plan' | 'mapa') {
    this.paso.set(p);
    if (p === 'ef') {
      const id = Number(this.form.get('id_paciente')?.value || 0);
      if (id) this.cargarMarcadoresCuerpo(id);
    }
  }

  siguientePaso() {
    const order = ['anam', 'ef', 'diag', 'plan', 'mapa'] as const;
    const i = order.indexOf(this.paso());
    if (i < order.length - 1) this.setPaso(order[i + 1]);
  }

  anteriorPaso() {
    const order = ['anam', 'ef', 'diag', 'plan', 'mapa'] as const;
    const i = order.indexOf(this.paso());
    if (i > 0) this.setPaso(order[i - 1]);
  }

  idCitaAtencion(): number | null {
    const v = this.form?.get('id_cita')?.value || this.citaVinculo();
    return v ? Number(v) : null;
  }

  cerrarAtencion() {
    const idPac = this.form.get('id_paciente')?.value;
    if (idPac) {
      this.router.navigate(['/atencion-paciente'], {
        queryParams: { id_paciente: idPac, tab: 'resumen' },
      });
    } else {
      this.router.navigate(['/agenda']);
    }
  }

  limpiarFormulario() {
    const sede = this.form.get('id_sede')?.value;
    const personal = this.form.get('id_personal')?.value;
    const paciente = this.form.get('id_paciente')?.value;
    const veniaDeCita = !!this.citaVinculo() || !!this.route.snapshot.queryParamMap.get('id_cita');
    while (this.medicamentosFA.length) this.medicamentosFA.removeAt(0);
    this.diagnosticos.set([]);
    this.citaVinculo.set(null);
    this.idConsulta.set(null);
    this.consultaCerrada.set(false);
    if (this.form.disabled) this.form.enable({ emitEvent: false });
    this.form.reset({
      id_paciente: paciente,
      id_sede: sede,
      id_personal: personal,
      id_cita: null,
      id_plantilla_clinica: null,
      fecha_consulta: new Date().toISOString().slice(0, 16),
      motivo_consulta: '',
      tiempo_enfermedad: '',
      tipo_enfermedad: null,
      relato: '',
      adjuntos_nota: '',
      apreciacion: '',
      plan_indicaciones: '',
      examen: {
        peso: null,
        talla: null,
        estado_mental: '',
        estado_general: '',
        pa_sistolica: null,
        pa_diastolica: null,
        fc: null,
        fr: null,
        sat_o2: null,
        temperatura: null,
        sistemas: Object.fromEntries(this.sistemasCatalogo.map((s) => [s, ''])),
        anatomicos: Object.fromEntries(this.anatomicosCatalogo.map((s) => [s, ''])),
      },
    });
    if (veniaDeCita) {
      this.router.navigate(['/historia-clinica'], { replaceUrl: true });
    }
  }

  toggleHist(id: number) {
    this.expandedHist.update((cur) => (cur === id ? null : id));
  }

  labelPaciente = (p: any) =>
    p
      ? `${p.apellidos || ''} ${p.nombres || ''}`.trim() +
        (p.numero_documento ? ` · ${p.numero_documento}` : '')
      : '';

  labelPersonal = (p: any) =>
    p
      ? `${p.apellidos || ''} ${p.nombres || ''}`.trim() +
        (p.especialidad ? ` · ${p.especialidad}` : '')
      : '';
}
