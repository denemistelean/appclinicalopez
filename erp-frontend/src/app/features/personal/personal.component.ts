import { Component, inject, OnInit, TemplateRef, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { firstValueFrom } from 'rxjs';

import { useCrud } from 'src/app/core/utils/crud.util';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { ErpTabsComponent, ErpTab } from 'src/app/shared/components/erp-tabs/erp-tabs.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { SedesService } from '../sedes/sedes.service';
import { TratamientosService } from '../tratamientos/tratamientos.service';
import { PersonalService } from './personal.service';

@Component({
  selector: 'app-personal',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, TableProComponent, FormErrorComponent,
    ErpTabsComponent, NgbModalModule, NgSelectModule,
  ],
  templateUrl: './personal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(PersonalService);
  private sedesService = inject(SedesService);
  private tratamientosService = inject(TratamientosService);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);

  public crud = useCrud<any>(this.service as any, { itemName: 'Personal' });

  form: FormGroup;
  formHorario: FormGroup;
  formExcepcion: FormGroup;
  formCert: FormGroup;

  activeTab = signal('datos');
  tabs: ErpTab[] = [
    { id: 'datos', label: 'Datos', icon: 'bi-person-badge' },
    { id: 'horario', label: 'Horario', icon: 'bi-clock' },
    { id: 'excepciones', label: 'Excepciones', icon: 'bi-calendar-x' },
    { id: 'certificaciones', label: 'Certificaciones', icon: 'bi-award' },
  ];

  sedes = signal<any[]>([]);
  tratamientos = signal<any[]>([]);
  especialidades = signal<any[]>([]);
  horario = signal<any[]>([]);
  excepciones = signal<any[]>([]);
  certificaciones = signal<any[]>([]);

  /** Permite crear especialidad al vuelo desde ng-select */
  crearEspecialidadTag = async (nombre: string) => {
    const n = String(nombre || '').trim().toUpperCase();
    if (!n) return null as any;
    const res: any = await firstValueFrom(this.service.createEspecialidad({ nombre: n }));
    const id = Number(res?.data?.id ?? res?.id);
    const item = { id_especialidad: id, nombre: n };
    this.especialidades.update((list) =>
      list.some((x) => Number(x.id_especialidad) === id) ? list : [...list, item],
    );
    return item;
  };

  diasSemana = [
    { id: 0, nombre: 'Domingo' }, { id: 1, nombre: 'Lunes' }, { id: 2, nombre: 'Martes' },
    { id: 3, nombre: 'Miércoles' }, { id: 4, nombre: 'Jueves' }, { id: 5, nombre: 'Viernes' },
    { id: 6, nombre: 'Sábado' },
  ];
  estados = [
    { id: 'ACTIVO', nombre: 'ACTIVO' }, { id: 'INACTIVO', nombre: 'INACTIVO' },
    { id: 'VACACIONES', nombre: 'VACACIONES' }, { id: 'LICENCIA', nombre: 'LICENCIA' },
  ];
  tiposExcepcion = [
    { id: 'DIA_LIBRE', nombre: 'DÍA LIBRE' },
    { id: 'HORARIO_ESPECIAL', nombre: 'HORARIO ESPECIAL' },
    { id: 'BLOQUEO', nombre: 'BLOQUEO' },
  ];

  constructor() {
    this.form = this.fb.group({
      documento: ['', Validators.required],
      tipo_documento: ['DNI'],
      nombres: ['', Validators.required],
      apellidos: ['', Validators.required],
      especialidad: [''],
      ids_especialidad: [[] as number[]],
      telefono: [''],
      email: [''],
      id_sede_principal: [null],
      estado: ['ACTIVO', Validators.required],
      observaciones: [''],
    });
    this.formHorario = this.fb.group({
      id_sede: [null, Validators.required],
      dia_semana: [1, Validators.required],
      hora_inicio: ['08:00', Validators.required],
      hora_fin: ['17:00', Validators.required],
    });
    this.formExcepcion = this.fb.group({
      id_sede: [null],
      fecha: ['', Validators.required],
      tipo: ['DIA_LIBRE', Validators.required],
      hora_inicio: [''],
      hora_fin: [''],
      motivo: [''],
    });
    this.formCert = this.fb.group({
      id_tratamiento: [null, Validators.required],
      fecha_certificacion: [''],
      fecha_vencimiento: [''],
      observaciones: [''],
    });
  }

  ngOnInit() {
    this.sedesService.findAll(1, 100, '').subscribe({
      next: (res: any) => this.sedes.set(res.data?.data || res.data || []),
    });
    this.tratamientosService.findAll(1, 200, '').subscribe({
      next: (res: any) => this.tratamientos.set(res.data?.data || res.data || []),
      error: () => this.tratamientos.set([]),
    });
    this.cargarEspecialidades();
  }

  private cargarEspecialidades() {
    this.service.listEspecialidades().subscribe({
      next: (res: any) => this.especialidades.set(res.data?.data || res.data || res || []),
      error: () => this.especialidades.set([]),
    });
  }

  onSearch(term: string) { this.crud.searchControl.setValue(term); }

  onTabChange(tab: string) {
    this.activeTab.set(tab);
    const id = this.crud.editingId();
    if (!id) return;
    if (tab === 'horario') this.cargarHorario(id);
    if (tab === 'excepciones') this.cargarExcepciones(id);
    if (tab === 'certificaciones') this.cargarCertificaciones(id);
  }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.activeTab.set('datos');
    if (item) {
      this.alert.showLoading('Cargando personal...');
      this.service.findOne(item.id_personal).subscribe({
        next: (res: any) => {
          this.alert.closeLoading();
          const data = res.data?.data || res.data;
          this.crud.setupModal(data.id_personal);
          this.form.patchValue({
            ...data,
            ids_especialidad: data.ids_especialidad || [],
          });
          this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'xl' });
        },
        error: () => { this.alert.closeLoading(); this.alert.error('No se pudo cargar el personal.'); },
      });
    } else {
      this.crud.setupModal(null);
      this.form.reset({ tipo_documento: 'DNI', estado: 'ACTIVO', ids_especialidad: [] });
      this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'xl' });
    }
  }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const raw = this.form.getRawValue();
    this.crud.save({
      ...raw,
      ids_especialidad: Array.isArray(raw.ids_especialidad) ? raw.ids_especialidad : [],
    });
  }

  private cargarHorario(id: number) {
    this.service.getHorario(id).subscribe({
      next: (res: any) => this.horario.set(res.data?.data || res.data || []),
    });
  }

  private cargarExcepciones(id: number) {
    this.service.getExcepciones(id).subscribe({
      next: (res: any) => this.excepciones.set(res.data?.data || res.data || []),
    });
  }

  private cargarCertificaciones(id: number) {
    this.service.getCertificaciones(id).subscribe({
      next: (res: any) => this.certificaciones.set(res.data?.data || res.data || []),
    });
  }

  agregarBloqueHorario() {
    if (this.formHorario.invalid) { this.formHorario.markAllAsTouched(); return; }
    const lista = [...this.horario(), this.formHorario.getRawValue()];
    this.horario.set(lista);
    this.formHorario.patchValue({ dia_semana: 1, hora_inicio: '08:00', hora_fin: '17:00' });
  }

  guardarHorario() {
    const id = this.crud.editingId();
    if (!id) return;
    this.service.setHorario(id, { items: this.horario() }).subscribe({
      next: () => this.alert.success('Horario guardado'),
      error: (err: any) => this.alert.error(err.error?.mensaje || 'Error al guardar horario'),
    });
  }

  quitarHorario(idx: number) {
    this.horario.update(list => list.filter((_, i) => i !== idx));
  }

  agregarExcepcion() {
    const id = this.crud.editingId();
    if (!id || this.formExcepcion.invalid) { this.formExcepcion.markAllAsTouched(); return; }
    this.service.addExcepcion(id, this.formExcepcion.getRawValue()).subscribe({
      next: () => {
        this.alert.success('Excepción agregada');
        this.formExcepcion.reset({ tipo: 'DIA_LIBRE' });
        this.cargarExcepciones(id);
      },
      error: (err: any) => this.alert.error(err.error?.mensaje || 'Error'),
    });
  }

  agregarCertificacion() {
    const id = this.crud.editingId();
    if (!id || this.formCert.invalid) { this.formCert.markAllAsTouched(); return; }
    this.service.addCertificacion(id, this.formCert.getRawValue()).subscribe({
      next: () => {
        this.alert.success('Certificación agregada');
        this.formCert.reset();
        this.cargarCertificaciones(id);
      },
      error: (err: any) => this.alert.error(err.error?.mensaje || 'Error'),
    });
  }

  eliminarCertificacion(idCert: number) {
    const id = this.crud.editingId();
    if (!id) return;
    this.service.deleteCertificacion(id, idCert).subscribe({
      next: () => { this.alert.success('Eliminada'); this.cargarCertificaciones(id); },
      error: (err: any) => this.alert.error(err.error?.mensaje || 'Error'),
    });
  }

  nombreDia(d: number) {
    return this.diasSemana.find(x => x.id === d)?.nombre || d;
  }
}
