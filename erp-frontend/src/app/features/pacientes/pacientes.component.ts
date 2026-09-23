import { Component, inject, TemplateRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';

import { useCrud } from 'src/app/core/utils/crud.util';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { PacientesService } from './pacientes.service';

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule, TableProComponent,
    FormErrorComponent, NgbModalModule, NgSelectModule,
  ],
  templateUrl: './pacientes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PacientesComponent {
  private fb = inject(FormBuilder);
  private service = inject(PacientesService);
  private alert = inject(AlertService);
  private router = inject(Router);
  public perms = inject(PermissionsService);

  public crud = useCrud<any>(this.service as any, { itemName: 'Paciente' });

  form: FormGroup;

  sexos = [
    { id: 'M', nombre: 'Masculino' },
    { id: 'F', nombre: 'Femenino' },
    { id: 'X', nombre: 'X' },
    { id: 'NO_ESPECIFICADO', nombre: 'No especificado' },
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
      distrito: [''],
      ciudad: [''],
      observaciones: [''],
    });
  }

  onSearch(term: string) { this.crud.searchControl.setValue(term); }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (item) {
      this.alert.showLoading('Cargando paciente...');
      this.service.findOne(item.id_paciente).subscribe({
        next: (res: any) => {
          this.alert.closeLoading();
          const data = res.data?.data || res.data;
          this.crud.setupModal(data.id_paciente);
          this.form.patchValue(data);
          this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
        },
        error: () => { this.alert.closeLoading(); this.alert.error('No se pudo cargar.'); },
      });
    } else {
      this.crud.setupModal(null);
      this.form.reset({ tipo_documento: 'DNI' });
      this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
    }
  }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.crud.save(this.form.getRawValue());
  }

  verFicha(id: number) {
    this.router.navigate(['/pacientes', id]);
  }
}
