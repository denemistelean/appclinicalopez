import { Component, inject, TemplateRef, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';

import { useCrud } from 'src/app/core/utils/crud.util';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { ErpTabsComponent, ErpTab } from 'src/app/shared/components/erp-tabs/erp-tabs.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { SedesService } from './sedes.service';

@Component({
  selector: 'app-sedes',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, TableProComponent, FormErrorComponent,
    ErpTabsComponent, NgbModalModule, NgSelectModule,
  ],
  templateUrl: './sedes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SedesComponent {
  private fb = inject(FormBuilder);
  private service = inject(SedesService);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);

  public crud = useCrud<any>(this.service as any, { itemName: 'Sede' });

  form: FormGroup;
  formSala: FormGroup;
  formEquipo: FormGroup;

  activeTab = signal('datos');
  tabs: ErpTab[] = [
    { id: 'datos', label: 'Datos', icon: 'bi-building' },
    { id: 'salas', label: 'Salas', icon: 'bi-door-open' },
    { id: 'equipos', label: 'Equipos', icon: 'bi-cpu' },
  ];

  salas = signal<any[]>([]);
  equipos = signal<any[]>([]);
  tiposEquipo = signal<any[]>([]);
  editingSalaId = signal<number | null>(null);
  editingEquipoId = signal<number | null>(null);

  estadosSede = [
    { id: 'ACTIVA', nombre: 'ACTIVA' },
    { id: 'INACTIVA', nombre: 'INACTIVA' },
  ];
  estadosSala = [
    { id: 'DISPONIBLE', nombre: 'DISPONIBLE' },
    { id: 'OCUPADA', nombre: 'OCUPADA' },
    { id: 'MANTENIMIENTO', nombre: 'MANTENIMIENTO' },
    { id: 'INACTIVA', nombre: 'INACTIVA' },
  ];
  estadosEquipo = [
    { id: 'OPERATIVO', nombre: 'OPERATIVO' },
    { id: 'EN_MANTENIMIENTO', nombre: 'EN_MANTENIMIENTO' },
    { id: 'DE_BAJA', nombre: 'DE_BAJA' },
  ];

  constructor() {
    this.form = this.fb.group({
      nombre: ['', Validators.required],
      razon_social: [''],
      direccion: [''],
      ciudad: [''],
      distrito: [''],
      telefono: [''],
      email_contacto: [''],
      horario_apertura: [''],
      horario_cierre: [''],
      logo_url: [''],
      estado: ['ACTIVA', Validators.required],
      libre_disposicion: [false],
    });

    this.formSala = this.fb.group({
      nombre: ['', Validators.required],
      capacidad_equipo: [''],
      estado: ['DISPONIBLE'],
    });

    this.formEquipo = this.fb.group({
      nombre: ['', Validators.required],
      id_tipo_equipo: [null],
      tipo: [''],
      numero_serie: [''],
      fecha_adquisicion: [''],
      estado: ['OPERATIVO'],
    });
  }

  onSearch(term: string) { this.crud.searchControl.setValue(term); }

  onTabChange(tab: string) {
    this.activeTab.set(tab);
    const id = this.crud.editingId();
    if (!id) return;
    if (tab === 'salas') {
      this.cancelarEdicionSala();
      this.cargarSalas(id);
    }
    if (tab === 'equipos') {
      this.cancelarEdicionEquipo();
      this.cargarTiposEquipo();
      this.cargarEquipos(id);
    }
  }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.activeTab.set('datos');
    this.salas.set([]);
    this.equipos.set([]);
    this.cancelarEdicionSala();
    this.cancelarEdicionEquipo();

    if (item) {
      this.alert.showLoading('Cargando sede...');
      this.service.findOne(item.id_sede).subscribe({
        next: (res: any) => {
          this.alert.closeLoading();
          const data = res.data?.data || res.data;
          this.crud.setupModal(data.id_sede);
          this.form.patchValue({
            ...data,
            libre_disposicion: !!(Number(data.libre_disposicion) === 1 || data.libre_disposicion === true),
          });
          this.cargarTiposEquipo();
          this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'xl' });
        },
        error: () => {
          this.alert.closeLoading();
          this.alert.error('No se pudo cargar la sede.');
        },
      });
    } else {
      this.crud.setupModal(null);
      this.form.reset({ estado: 'ACTIVA', libre_disposicion: false });
      this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'xl' });
    }
  }

  guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.crud.save(this.form.getRawValue());
  }

  private cargarTiposEquipo() {
    this.service.listTiposEquipo().subscribe({
      next: (res: any) => this.tiposEquipo.set(res.data?.data || res.data || []),
    });
  }

  private cargarSalas(idSede: number) {
    this.service.listSalas(idSede).subscribe({
      next: (res: any) => this.salas.set(res.data?.data || res.data || []),
    });
  }

  private cargarEquipos(idSede: number) {
    this.service.listEquipos(idSede).subscribe({
      next: (res: any) => this.equipos.set(res.data?.data || res.data || []),
    });
  }

  editarSala(s: any) {
    this.editingSalaId.set(Number(s.id_sala));
    this.formSala.patchValue({
      nombre: s.nombre || '',
      capacidad_equipo: s.capacidad_equipo || '',
      estado: s.estado || 'DISPONIBLE',
    });
  }

  cancelarEdicionSala() {
    this.editingSalaId.set(null);
    this.formSala.reset({ estado: 'DISPONIBLE' });
  }

  guardarSala() {
    const id = this.crud.editingId();
    if (!id || this.formSala.invalid) {
      this.formSala.markAllAsTouched();
      return;
    }
    const payload = this.formSala.getRawValue();
    const idSala = this.editingSalaId();
    const req$ = idSala
      ? this.service.updateSala(idSala, payload)
      : this.service.createSala(id, payload);
    req$.subscribe({
      next: () => {
        this.alert.success(idSala ? 'Sala actualizada' : 'Sala agregada');
        this.cancelarEdicionSala();
        this.cargarSalas(id);
      },
      error: (err: any) =>
        this.alert.error(err.error?.mensaje || err.error?.message || 'Error al guardar sala'),
    });
  }

  eliminarSala(idSala: number) {
    const id = this.crud.editingId();
    if (!id) return;
    this.alert.confirmDelete('¿Eliminar sala?', 'Se desactivará la sala.').then((ok) => {
      if (!ok) return;
      this.service.deleteSala(idSala).subscribe({
        next: () => {
          this.alert.success('Sala eliminada');
          if (this.editingSalaId() === idSala) this.cancelarEdicionSala();
          this.cargarSalas(id);
        },
        error: (err: any) => this.alert.error(err.error?.mensaje || 'No se pudo eliminar'),
      });
    });
  }

  editarEquipo(e: any) {
    this.editingEquipoId.set(Number(e.id_equipo));
    this.formEquipo.patchValue({
      nombre: e.nombre || '',
      id_tipo_equipo: e.id_tipo_equipo || null,
      tipo: e.tipo || '',
      numero_serie: e.numero_serie || '',
      fecha_adquisicion: e.fecha_adquisicion
        ? String(e.fecha_adquisicion).slice(0, 10)
        : '',
      estado: e.estado || 'OPERATIVO',
    });
  }

  cancelarEdicionEquipo() {
    this.editingEquipoId.set(null);
    this.formEquipo.reset({ estado: 'OPERATIVO' });
  }

  guardarEquipo() {
    const id = this.crud.editingId();
    if (!id || this.formEquipo.invalid) {
      this.formEquipo.markAllAsTouched();
      return;
    }
    const payload = this.formEquipo.getRawValue();
    const idEquipo = this.editingEquipoId();
    const req$ = idEquipo
      ? this.service.updateEquipo(idEquipo, payload)
      : this.service.createEquipo(id, payload);
    req$.subscribe({
      next: () => {
        this.alert.success(idEquipo ? 'Equipo actualizado' : 'Equipo agregado');
        this.cancelarEdicionEquipo();
        this.cargarEquipos(id);
      },
      error: (err: any) =>
        this.alert.error(err.error?.mensaje || err.error?.message || 'Error al guardar equipo'),
    });
  }

  eliminarEquipo(idEquipo: number) {
    const id = this.crud.editingId();
    if (!id) return;
    this.alert.confirmDelete('¿Eliminar equipo?', 'Se desactivará el equipo.').then((ok) => {
      if (!ok) return;
      this.service.deleteEquipo(idEquipo).subscribe({
        next: () => {
          this.alert.success('Equipo eliminado');
          if (this.editingEquipoId() === idEquipo) this.cancelarEdicionEquipo();
          this.cargarEquipos(id);
        },
        error: (err: any) => this.alert.error(err.error?.mensaje || 'No se pudo eliminar'),
      });
    });
  }
}
