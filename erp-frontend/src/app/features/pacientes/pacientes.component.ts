import { Component, inject, TemplateRef, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';

import { useCrud } from 'src/app/core/utils/crud.util';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { ErpTabsComponent, ErpTab } from 'src/app/shared/components/erp-tabs/erp-tabs.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { PacientesService } from './pacientes.service';
import { UnidadContextService } from 'src/app/core/services/unidad-context.service';

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule, TableProComponent,
    FormErrorComponent, ErpTabsComponent, NgbModalModule, NgSelectModule,
  ],
  templateUrl: './pacientes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PacientesComponent {
  private fb = inject(FormBuilder);
  private service = inject(PacientesService);
  private alert = inject(AlertService);
  private router = inject(Router);
  private unidad = inject(UnidadContextService);
  public perms = inject(PermissionsService);

  public crud = useCrud<any>(this.service as any, { itemName: 'Paciente' });

  form: FormGroup;
  formContacto: FormGroup;
  activeTab = signal('datos');
  contactos = signal<any[]>([]);

  tabs: ErpTab[] = [
    { id: 'datos', label: 'Datos', icon: 'bi-person' },
    { id: 'filiacion', label: 'Filiación', icon: 'bi-card-list' },
    { id: 'emergencia', label: 'Contacto de emergencia', icon: 'bi-telephone-forward' },
  ];

  sexos = [
    { id: 'M', nombre: 'Masculino' },
    { id: 'F', nombre: 'Femenino' },
    { id: 'X', nombre: 'X' },
    { id: 'NO_ESPECIFICADO', nombre: 'No especificado' },
  ];
  estadosCiviles = [
    { id: 'SOLTERO', nombre: 'Soltero(a)' },
    { id: 'CASADO', nombre: 'Casado(a)' },
    { id: 'CONVIVIENTE', nombre: 'Conviviente' },
    { id: 'DIVORCIADO', nombre: 'Divorciado(a)' },
    { id: 'VIUDO', nombre: 'Viudo(a)' },
    { id: 'SEPARADO', nombre: 'Separado(a)' },
  ];
  educaciones = [
    { id: 'NINGUNA', nombre: 'Ninguna' },
    { id: 'PRIMARIA', nombre: 'Primaria' },
    { id: 'SECUNDARIA', nombre: 'Secundaria' },
    { id: 'TECNICA', nombre: 'Técnica' },
    { id: 'UNIVERSITARIA', nombre: 'Universitaria' },
    { id: 'POSTGRADO', nombre: 'Postgrado' },
  ];
  gruposSanguineos = [
    { id: 'O+', nombre: 'O+' }, { id: 'O-', nombre: 'O-' },
    { id: 'A+', nombre: 'A+' }, { id: 'A-', nombre: 'A-' },
    { id: 'B+', nombre: 'B+' }, { id: 'B-', nombre: 'B-' },
    { id: 'AB+', nombre: 'AB+' }, { id: 'AB-', nombre: 'AB-' },
  ];
  parentescos = [
    'Padre', 'Madre', 'Cónyuge', 'Hijo(a)', 'Hermano(a)',
    'Abuelo(a)', 'Tío(a)', 'Amigo(a)', 'Otro',
  ].map((n) => ({ id: n, nombre: n }));

  constructor() {
    this.form = this.fb.group({
      tipo_documento: ['DNI'],
      numero_documento: ['', Validators.required],
      nombres: ['', Validators.required],
      apellidos: ['', Validators.required],
      fecha_nacimiento: [''],
      sexo: [null],
      telefono: [''],
      telefono_alterno: [''],
      telefono_whatsapp: [''],
      email: [''],
      direccion: [''],
      distrito: [''],
      ciudad: [''],
      observaciones: [''],
      estado_civil: [null],
      educacion: [null],
      ocupacion: [''],
      religion: [''],
      identidad_genero: [''],
      orientacion_sexual: [''],
      idioma: [''],
      como_nos_conocio: [''],
      seguro_salud: [''],
      numero_seguro: [''],
      grupo_sanguineo: [null],
    });
    this.formContacto = this.fb.group({
      nombre: ['', Validators.required],
      parentesco: [null],
      telefono: [''],
      direccion: [''],
      datos_adicionales: [''],
    });
  }

  onSearch(term: string) { this.crud.searchControl.setValue(term); }

  onTabChange(tab: string) {
    this.activeTab.set(tab);
    const id = this.crud.editingId();
    if (tab === 'emergencia' && id) this.cargarContactos(id);
  }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.activeTab.set('datos');
    this.contactos.set([]);
    if (item) {
      this.alert.showLoading('Cargando paciente...');
      this.service.findOne(item.id_paciente).subscribe({
        next: (res: any) => {
          this.alert.closeLoading();
          const data = res.data?.data || res.data;
          this.crud.setupModal(data.id_paciente);
          this.form.patchValue(data);
          this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'xl' });
        },
        error: () => { this.alert.closeLoading(); this.alert.error('No se pudo cargar.'); },
      });
    } else {
      this.crud.setupModal(null);
      this.form.reset({ tipo_documento: 'DNI' });
      this.formContacto.reset();
      this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'xl' });
    }
  }

  guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.activeTab.set('datos');
      return;
    }
    this.crud.save(this.form.getRawValue());
  }

  private cargarContactos(id: number) {
    this.service.getContactosEmergencia(id).subscribe({
      next: (res: any) => this.contactos.set(res.data?.data || res.data || []),
      error: () => this.contactos.set([]),
    });
  }

  agregarContacto() {
    const id = this.crud.editingId();
    if (!id || this.formContacto.invalid) {
      this.formContacto.markAllAsTouched();
      return;
    }
    this.service.addContactoEmergencia(id, this.formContacto.getRawValue()).subscribe({
      next: () => {
        this.alert.success('Contacto agregado');
        this.formContacto.reset();
        this.cargarContactos(id);
      },
      error: (err: any) => this.alert.error(err.error?.mensaje || 'Error'),
    });
  }

  eliminarContacto(idContacto: number) {
    const id = this.crud.editingId();
    if (!id) return;
    this.service.deleteContactoEmergencia(id, idContacto).subscribe({
      next: () => {
        this.alert.success('Contacto eliminado');
        this.cargarContactos(id);
      },
      error: (err: any) => this.alert.error(err.error?.mensaje || 'Error'),
    });
  }

  esSorela(): boolean {
    const codigo = this.unidad.membresias().find((m) => m.id_unidad === this.unidad.idUnidad())?.codigo;
    return String(codigo || '').toUpperCase() === 'SORELA';
  }

  verHistoriaDigital(id: number) {
    this.router.navigate(['/pacientes', id, 'historia-digital']);
  }

  /** Historia clínica del paciente (Resumen / Atenciones / Archivos / Agenda). */
  verHistoriaClinica(id: number) {
    this.router.navigate(['/atencion-paciente'], {
      queryParams: { id_paciente: id, tab: 'resumen' },
    });
  }
}
