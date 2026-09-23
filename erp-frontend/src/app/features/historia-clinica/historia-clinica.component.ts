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
import { Subject, debounceTime, distinctUntilChanged, filter, switchMap, catchError, of } from 'rxjs';

import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { SedeContextService } from 'src/app/core/services/sede-context.service';
import { PacientesService } from '../pacientes/pacientes.service';
import { PersonalService } from '../personal/personal.service';
import { SedesService } from '../sedes/sedes.service';
import { HistoriaClinicaService } from './historia-clinica.service';

@Component({
  selector: 'app-historia-clinica',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, FormErrorComponent, NgSelectModule],
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
  historial = signal<any[]>([]);
  saving = signal(false);
  expandedHist = signal<number | null>(null);

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
      id_plantilla_clinica: [null],
      fecha_consulta: [new Date().toISOString().slice(0, 16), Validators.required],
      motivo_consulta: ['', Validators.required],
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
      } else {
        this.historial.set([]);
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
    this.diagnosticos.update((list) => [
      ...list,
      { id_cie10: null, codigo_cie10: null, descripcion: t, tipo: 'PRESUNTIVO' },
    ]);
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

  guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.alert.warning('Complete paciente, sede, profesional, fecha y motivo');
      return;
    }
    if (!this.diagnosticos().length) {
      this.alert.warning('Agregue al menos un diagnóstico');
      return;
    }
    const raw = this.form.getRawValue();
    const examen = raw.examen;
    const payload = {
      id_paciente: Number(raw.id_paciente),
      id_sede: Number(raw.id_sede),
      id_personal: Number(raw.id_personal),
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
      examen_json: { ...examen, imc: this.imcVal() },
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
    this.alert.showLoading('Guardando consulta...');
    this.service.create(payload).subscribe({
      next: (res: any) => {
        this.alert.closeLoading();
        this.saving.set(false);
        const id = res.data?.id || res.id;
        this.alert.success('Consulta guardada');
        if (id && this.perms.hasPermission('actualizar_historia_clinica')) {
          this.service.finalizar(id).subscribe({
            next: () => this.alert.success('Consulta finalizada'),
            error: () => {},
          });
        }
        this.limpiarFormulario();
        if (raw.id_paciente) this.cargarHistorial(Number(raw.id_paciente));
      },
      error: (err) => {
        this.alert.closeLoading();
        this.saving.set(false);
        this.alert.error(err.error?.mensaje || 'No se pudo guardar');
      },
    });
  }

  limpiarFormulario() {
    const sede = this.form.get('id_sede')?.value;
    const personal = this.form.get('id_personal')?.value;
    const paciente = this.form.get('id_paciente')?.value;
    while (this.medicamentosFA.length) this.medicamentosFA.removeAt(0);
    this.diagnosticos.set([]);
    this.form.reset({
      id_paciente: paciente,
      id_sede: sede,
      id_personal: personal,
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
