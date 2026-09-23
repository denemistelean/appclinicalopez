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
import { SedesService } from '../sedes/sedes.service';
import { FacturacionService } from './facturacion.service';

@Component({
  selector: 'app-facturacion',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TableProComponent, FormErrorComponent, NgbModalModule, NgSelectModule],
  templateUrl: './facturacion.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacturacionComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(FacturacionService);
  private pacientesService = inject(PacientesService);
  private sedesService = inject(SedesService);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);
  public crud = useCrud<any>(this.service as any, { itemName: 'Cotización' });
  form: FormGroup;
  pacientes = signal<any[]>([]);
  sedes = signal<any[]>([]);
  estados = [
    { id: 'BORRADOR', nombre: 'BORRADOR' },
    { id: 'ENVIADA', nombre: 'ENVIADA' },
    { id: 'ACEPTADA', nombre: 'ACEPTADA' },
    { id: 'RECHAZADA', nombre: 'RECHAZADA' },
    { id: 'ANULADA', nombre: 'ANULADA' },
  ];

  constructor() {
    this.form = this.fb.group({
      id_paciente: [null, Validators.required],
      id_sede: [null, Validators.required],
      fecha_cotizacion: [new Date().toISOString().slice(0, 10), Validators.required],
      subtotal: [0],
      descuento: [0],
      igv: [0],
      total: [0, Validators.required],
      estado: ['BORRADOR'],
      observaciones: [''],
    });
  }

  ngOnInit() {
    this.pacientesService.findAll(1, 200, '').subscribe({
      next: (res: any) => this.pacientes.set(res.data?.data || res.data || []),
    });
    this.sedesService.findAll(1, 100, '').subscribe({
      next: (res: any) => this.sedes.set(res.data?.data || res.data || []),
    });
  }

  onSearch(term: string) { this.crud.searchControl.setValue(term); }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (item) {
      this.alert.showLoading('Cargando...');
      this.service.findOne(item.id_cotizacion).subscribe({
        next: (res: any) => {
          this.alert.closeLoading();
          const data = res.data?.data || res.data;
          this.crud.setupModal(data.id_cotizacion);
          this.form.patchValue(data);
          this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
        },
        error: () => { this.alert.closeLoading(); this.alert.error('No se pudo cargar.'); },
      });
    } else {
      this.crud.setupModal(null);
      this.form.reset({ fecha_cotizacion: new Date().toISOString().slice(0, 10), subtotal: 0, descuento: 0, igv: 0, total: 0, estado: 'BORRADOR' });
      this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
    }
  }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.crud.save(this.form.getRawValue());
  }
}
