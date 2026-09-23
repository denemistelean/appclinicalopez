import { Component, inject, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';

import { ErpTabsComponent, ErpTab } from 'src/app/shared/components/erp-tabs/erp-tabs.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { PacientesService } from './pacientes.service';
import { HistoriaClinicaService } from '../historia-clinica/historia-clinica.service';
import { AgendaService } from '../agenda/agenda.service';

type HistSec = {
  id: string;
  recurso: string;
  titulo: string;
  pk: string;
};

@Component({
  selector: 'app-paciente-ficha',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule, ErpTabsComponent,
    FormErrorComponent, NgSelectModule,
  ],
  templateUrl: './paciente-ficha.component.html',
  styleUrl: './paciente-ficha.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PacienteFichaComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private service = inject(PacientesService);
  private hcService = inject(HistoriaClinicaService);
  private agendaService = inject(AgendaService);
  private fb = inject(FormBuilder);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);

  idPaciente = signal(0);
  paciente = signal<any>(null);
  resumen = signal<any>(null);
  documentos = signal<any[]>([]);
  consultas = signal<any[]>([]);
  citas = signal<any[]>([]);
  historiaResumen = signal<any>(null);
  historiaItems = signal<Record<string, any[]>>({});
  histSec = signal('medidas');
  activeTab = signal('datos');

  form: FormGroup;
  formMedida: FormGroup;
  formVital: FormGroup;
  formVacuna: FormGroup;
  formPatologico: FormGroup;
  formPersonal: FormGroup;
  formQuirurgico: FormGroup;
  formFamiliar: FormGroup;
  formAlergia: FormGroup;
  formMedicacion: FormGroup;
  formGineco: FormGroup;
  formEmbarazo: FormGroup;

  secciones: HistSec[] = [
    { id: 'medidas', recurso: 'medidas', titulo: 'Últimas medidas', pk: 'id_paciente_medida' },
    { id: 'vitales', recurso: 'vitales', titulo: 'Últimas funciones vitales', pk: 'id_paciente_funcion_vital' },
    { id: 'vacunas', recurso: 'vacunas', titulo: 'Vacunas', pk: 'id_paciente_vacuna' },
    { id: 'patologicos', recurso: 'antecedentes-patologicos', titulo: 'Antecedentes patológicos', pk: 'id_paciente_antecedente_patologico' },
    { id: 'personales', recurso: 'antecedentes-personales', titulo: 'Antecedentes personales', pk: 'id_paciente_antecedente_personal' },
    { id: 'quirurgicos', recurso: 'antecedentes-quirurgicos', titulo: 'Antecedentes quirúrgicos', pk: 'id_paciente_antecedente_quirurgico' },
    { id: 'familiares', recurso: 'antecedentes-familiares', titulo: 'Antecedentes familiares', pk: 'id_paciente_antecedente_familiar' },
    { id: 'alergias', recurso: 'alergias', titulo: 'Alergias y RAMs', pk: 'id_paciente_alergia_ram' },
    { id: 'medicaciones', recurso: 'medicaciones', titulo: 'Medicación habitual', pk: 'id_paciente_medicacion_habitual' },
    { id: 'gineco', recurso: 'gineco-obstetricos', titulo: 'Antecedentes gineco-obstétricos', pk: 'id_paciente_gineco_obstetrico' },
    { id: 'embarazos', recurso: 'embarazos', titulo: 'Embarazos', pk: 'id_paciente_embarazo' },
  ];

  tabs: ErpTab[] = [
    { id: 'datos', label: 'Datos', icon: 'bi-person' },
    { id: 'historia', label: 'Historia', icon: 'bi-heart-pulse' },
    { id: 'consultas', label: 'Consultas', icon: 'bi-journal-medical' },
    { id: 'citas', label: 'Citas', icon: 'bi-calendar2-week' },
    { id: 'documentos', label: 'Documentos', icon: 'bi-files' },
  ];

  sexos = [
    { id: 'M', nombre: 'Masculino' },
    { id: 'F', nombre: 'Femenino' },
    { id: 'X', nombre: 'X' },
    { id: 'NO_ESPECIFICADO', nombre: 'No especificado' },
  ];
  tiposPersonal = [
    { id: 'HABITO', nombre: 'Hábito' },
    { id: 'TOXICO', nombre: 'Tóxico' },
    { id: 'SOCIAL', nombre: 'Social' },
    { id: 'OTRO', nombre: 'Otro' },
  ];
  tiposAlergia = [
    { id: 'MEDICAMENTO', nombre: 'Medicamento' },
    { id: 'ALIMENTO', nombre: 'Alimento' },
    { id: 'AMBIENTAL', nombre: 'Ambiental' },
    { id: 'OTRO', nombre: 'Otro' },
  ];
  severidades = [
    { id: 'LEVE', nombre: 'Leve' },
    { id: 'MODERADA', nombre: 'Moderada' },
    { id: 'SEVERA', nombre: 'Severa' },
    { id: 'ANAFILAXIA', nombre: 'Anafilaxia' },
  ];
  estadosEmbarazo = [
    { id: 'EN_CURSO', nombre: 'En curso' },
    { id: 'CULMINADO', nombre: 'Culminado' },
    { id: 'ABORTADO', nombre: 'Abortado' },
    { id: 'DESCONOCIDO', nombre: 'Desconocido' },
  ];

  constructor() {
    this.form = this.fb.group({
      tipo_documento: ['DNI'],
      numero_documento: ['', Validators.required],
      nombres: ['', Validators.required],
      apellidos: ['', Validators.required],
      fecha_nacimiento: [''],
      sexo: [null],
      telefono: [''],
      email: [''],
      direccion: [''],
      observaciones: [''],
    });
    this.formMedida = this.fb.group({
      fecha_medida: [new Date().toISOString().slice(0, 16)],
      peso_kg: [null],
      talla_cm: [null],
      porcentaje_grasa: [null],
      observaciones: [''],
    });
    this.formVital = this.fb.group({
      fecha_registro: [new Date().toISOString().slice(0, 16)],
      temperatura_c: [null],
      saturacion_o2: [null],
      frecuencia_respiratoria: [null],
      frecuencia_cardiaca: [null],
      presion_sistolica: [null],
      presion_diastolica: [null],
      observaciones: [''],
    });
    this.formVacuna = this.fb.group({
      nombre_vacuna: ['', Validators.required],
      dosis: [''],
      fecha_aplicacion: [''],
      proxima_dosis: [''],
      lote: [''],
      observaciones: [''],
    });
    this.formPatologico = this.fb.group({
      diagnostico: ['', Validators.required],
      codigo_cie10: [''],
      fecha_diagnostico: [''],
      observaciones: [''],
    });
    this.formPersonal = this.fb.group({
      tipo: ['HABITO', Validators.required],
      descripcion: ['', Validators.required],
      observaciones: [''],
    });
    this.formQuirurgico = this.fb.group({
      procedimiento: ['', Validators.required],
      fecha_cirugia: [''],
      institucion: [''],
      observaciones: [''],
    });
    this.formFamiliar = this.fb.group({
      parentesco: ['', Validators.required],
      diagnostico: ['', Validators.required],
      observaciones: [''],
    });
    this.formAlergia = this.fb.group({
      sustancia: ['', Validators.required],
      tipo: ['MEDICAMENTO'],
      reaccion: [''],
      severidad: ['MODERADA'],
      observaciones: [''],
    });
    this.formMedicacion = this.fb.group({
      medicamento: ['', Validators.required],
      dosis: [''],
      frecuencia: [''],
      via: ['Oral'],
      fecha_inicio: [''],
      observaciones: [''],
    });
    this.formGineco = this.fb.group({
      descripcion: [''],
      menarquia_edad: [null],
      fur: [''],
      ciclo_dias: [null],
      gestaciones: [null],
      partos: [null],
      cesareas: [null],
      abortos: [null],
      metodo_anticonceptivo: [''],
      observaciones: [''],
    });
    this.formEmbarazo = this.fb.group({
      fecha_inicio: [''],
      fum: [''],
      fpp: [''],
      semanas_gestacion: [null],
      estado_embarazo: ['EN_CURSO'],
      resultado: [''],
      observaciones: [''],
    });
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.idPaciente.set(id);
    this.cargar();
  }

  onTabChange(tab: string) {
    this.activeTab.set(tab);
    const id = this.idPaciente();
    if (tab === 'historia') this.cargarHistoria(id);
    if (tab === 'consultas') this.cargarConsultas(id);
    if (tab === 'citas') this.cargarCitas(id);
    if (tab === 'documentos') this.cargarDocumentos(id);
  }

  setHistSec(id: string) {
    this.histSec.set(id);
  }

  private cargar() {
    const id = this.idPaciente();
    this.alert.showLoading('Cargando ficha...');
    this.service.findOne(id).subscribe({
      next: (res: any) => {
        this.alert.closeLoading();
        const data = res.data?.data || res.data;
        this.paciente.set(data);
        this.form.patchValue(data);
      },
      error: () => {
        this.alert.closeLoading();
        this.alert.error('No se pudo cargar la ficha.');
      },
    });
    this.service.getResumen(id).subscribe({
      next: (res: any) => this.resumen.set(res.data?.data || res.data || {}),
      error: () => this.resumen.set({}),
    });
  }

  private cargarHistoria(id: number) {
    this.service.getHistoriaResumen(id).subscribe({
      next: (res: any) => this.historiaResumen.set(res.data?.data || res.data || {}),
      error: () => this.historiaResumen.set({}),
    });
    for (const s of this.secciones) {
      this.service.listHistoria(id, s.recurso).subscribe({
        next: (res: any) => {
          const list = res.data?.data || res.data || res || [];
          this.historiaItems.update((m) => ({ ...m, [s.id]: Array.isArray(list) ? list : [] }));
        },
        error: () => this.historiaItems.update((m) => ({ ...m, [s.id]: [] })),
      });
    }
  }

  private cargarConsultas(id: number) {
    this.hcService.findAll(1, 50, '', { id_paciente: id }).subscribe({
      next: (res: any) => this.consultas.set(res.data?.data || res.data || []),
      error: () => this.consultas.set([]),
    });
  }

  private cargarCitas(id: number) {
    this.agendaService.findAll(1, 50, '', { id_paciente: id }).subscribe({
      next: (res: any) => this.citas.set(res.data?.data || res.data || []),
      error: () => this.citas.set([]),
    });
  }

  private cargarDocumentos(id: number) {
    this.service.getDocumentos(id).subscribe({
      next: (res: any) => this.documentos.set(res.data?.data || res.data || []),
      error: () => this.documentos.set([]),
    });
  }

  guardarDatos() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.service.update(this.idPaciente(), this.form.getRawValue()).subscribe({
      next: () => this.alert.success('Datos actualizados'),
      error: (err: any) => this.alert.error(err.error?.mensaje || 'Error al guardar'),
    });
  }

  itemsDe(secId: string): any[] {
    return this.historiaItems()[secId] || [];
  }

  imcPreview(): string {
    const p = Number(this.formMedida.get('peso_kg')?.value);
    const t = Number(this.formMedida.get('talla_cm')?.value);
    if (!p || !t) return '—';
    const m = t / 100;
    return String(Math.round((p / (m * m)) * 10) / 10);
  }

  agregar(secId: string) {
    const id = this.idPaciente();
    const sec = this.secciones.find((s) => s.id === secId);
    if (!sec) return;
    const map: Record<string, FormGroup> = {
      medidas: this.formMedida,
      vitales: this.formVital,
      vacunas: this.formVacuna,
      patologicos: this.formPatologico,
      personales: this.formPersonal,
      quirurgicos: this.formQuirurgico,
      familiares: this.formFamiliar,
      alergias: this.formAlergia,
      medicaciones: this.formMedicacion,
      gineco: this.formGineco,
      embarazos: this.formEmbarazo,
    };
    const f = map[secId];
    if (!f || f.invalid) {
      f?.markAllAsTouched();
      this.alert.warning('Complete los campos requeridos');
      return;
    }
    if (!this.perms.hasPermission('crear_historia_paciente')) {
      this.alert.warning('Sin permiso para crear historia');
      return;
    }
    const datos = { ...f.getRawValue() };
    if (secId === 'alergias') datos.activa = 1;
    if (secId === 'medicaciones' || secId === 'patologicos') datos.activo = 1;

    this.service.addHistoria(id, sec.recurso, datos).subscribe({
      next: () => {
        this.alert.success('Registro agregado');
        this.resetFormSec(secId);
        this.cargarHistoria(id);
      },
      error: (e) => this.alert.error(e.error?.mensaje || 'No se pudo agregar'),
    });
  }

  eliminar(secId: string, item: any) {
    const sec = this.secciones.find((s) => s.id === secId);
    if (!sec) return;
    if (!this.perms.hasPermission('eliminar_historia_paciente')) return;
    const itemId = item[sec.pk];
    this.alert.confirmAction('¿Eliminar registro?', 'Se marcará como eliminado.', 'Sí').then((ok) => {
      if (!ok) return;
      this.service.removeHistoria(this.idPaciente(), sec.recurso, itemId).subscribe({
        next: () => {
          this.alert.success('Eliminado');
          this.cargarHistoria(this.idPaciente());
        },
        error: (e) => this.alert.error(e.error?.mensaje || 'Error'),
      });
    });
  }

  private resetFormSec(secId: string) {
    const now = new Date().toISOString().slice(0, 16);
    if (secId === 'medidas') {
      this.formMedida.reset({ fecha_medida: now, peso_kg: null, talla_cm: null, porcentaje_grasa: null, observaciones: '' });
    } else if (secId === 'vitales') {
      this.formVital.reset({
        fecha_registro: now,
        temperatura_c: null,
        saturacion_o2: null,
        frecuencia_respiratoria: null,
        frecuencia_cardiaca: null,
        presion_sistolica: null,
        presion_diastolica: null,
        observaciones: '',
      });
    } else if (secId === 'vacunas') this.formVacuna.reset({ nombre_vacuna: '', dosis: '', fecha_aplicacion: '', proxima_dosis: '', lote: '', observaciones: '' });
    else if (secId === 'patologicos') this.formPatologico.reset({ diagnostico: '', codigo_cie10: '', fecha_diagnostico: '', observaciones: '' });
    else if (secId === 'personales') this.formPersonal.reset({ tipo: 'HABITO', descripcion: '', observaciones: '' });
    else if (secId === 'quirurgicos') this.formQuirurgico.reset({ procedimiento: '', fecha_cirugia: '', institucion: '', observaciones: '' });
    else if (secId === 'familiares') this.formFamiliar.reset({ parentesco: '', diagnostico: '', observaciones: '' });
    else if (secId === 'alergias') this.formAlergia.reset({ sustancia: '', tipo: 'MEDICAMENTO', reaccion: '', severidad: 'MODERADA', observaciones: '' });
    else if (secId === 'medicaciones') this.formMedicacion.reset({ medicamento: '', dosis: '', frecuencia: '', via: 'Oral', fecha_inicio: '', observaciones: '' });
    else if (secId === 'gineco') {
      this.formGineco.reset({
        descripcion: '', menarquia_edad: null, fur: '', ciclo_dias: null, gestaciones: null,
        partos: null, cesareas: null, abortos: null, metodo_anticonceptivo: '', observaciones: '',
      });
    } else if (secId === 'embarazos') {
      this.formEmbarazo.reset({
        fecha_inicio: '', fum: '', fpp: '', semanas_gestacion: null,
        estado_embarazo: 'EN_CURSO', resultado: '', observaciones: '',
      });
    }
  }
}
