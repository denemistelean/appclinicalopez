import { Component, inject, OnInit, TemplateRef, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { useCrud } from 'src/app/core/utils/crud.util';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { PacientesService } from '../pacientes/pacientes.service';
import { ConsentimientosService } from './consentimientos.service';

@Component({
  selector: 'app-consentimientos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TableProComponent, FormErrorComponent, NgbModalModule, NgSelectModule],
  templateUrl: './consentimientos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentimientosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(ConsentimientosService);
  private pacientesService = inject(PacientesService);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);
  public crud = useCrud<any>(this.service as any, { itemName: 'Consentimiento' });
  form: FormGroup;
  pacientes = signal<any[]>([]);
  plantillas = signal<any[]>([]);
  estados = [
    { id: 'PENDIENTE', nombre: 'PENDIENTE' },
    { id: 'FIRMADO', nombre: 'FIRMADO' },
    { id: 'RECHAZADO', nombre: 'RECHAZADO' },
    { id: 'ANULADO', nombre: 'ANULADO' },
  ];

  constructor() {
    this.form = this.fb.group({
      id_consentimiento_plantilla: [null, Validators.required],
      id_paciente: [null, Validators.required],
      estado: ['PENDIENTE'],
    });
  }

  ngOnInit() {
    this.pacientesService.findAll(1, 200, '').subscribe({
      next: (res: any) => this.pacientes.set(res.data?.data || res.data || []),
    });
    this.service.listPlantillas().subscribe({
      next: (res: any) => this.plantillas.set(res.data?.data || res.data || []),
      error: () => this.plantillas.set([]),
    });
  }

  onSearch(term: string) { this.crud.searchControl.setValue(term); }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (item) {
      this.alert.showLoading('Cargando...');
      this.service.findOne(item.id_consentimiento).subscribe({
        next: (res: any) => {
          this.alert.closeLoading();
          const data = res.data?.data || res.data;
          this.crud.setupModal(data.id_consentimiento);
          this.form.patchValue(data);
          this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
        },
        error: () => { this.alert.closeLoading(); this.alert.error('No se pudo cargar.'); },
      });
    } else {
      this.crud.setupModal(null);
      this.form.reset({ estado: 'PENDIENTE' });
      this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
    }
  }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.crud.save(this.form.getRawValue());
  }
}
