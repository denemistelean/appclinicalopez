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
import { SedeContextService } from 'src/app/core/services/sede-context.service';
import { SedesService } from '../sedes/sedes.service';
import { InventarioService } from './inventario.service';

@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TableProComponent, FormErrorComponent, NgbModalModule, NgSelectModule],
  templateUrl: './inventario.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventarioComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(InventarioService);
  private sedesService = inject(SedesService);
  private sedeCtx = inject(SedeContextService);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);

  public crud = useCrud<any>(this.service as any, { itemName: 'Insumo' });

  form: FormGroup;
  formMov: FormGroup;
  alertas = signal<any>({ stock_bajo: [], por_vencer: [] });
  sedes = signal<any[]>([]);
  insumos = signal<any[]>([]);

  tiposMov = [
    { id: 'INGRESO', nombre: 'INGRESO' },
    { id: 'SALIDA', nombre: 'SALIDA' },
    { id: 'AJUSTE', nombre: 'AJUSTE' },
    { id: 'DEVOLUCION', nombre: 'DEVOLUCIÓN' },
  ];
  estados = [
    { id: 'ACTIVO', nombre: 'ACTIVO' },
    { id: 'INACTIVO', nombre: 'INACTIVO' },
  ];

  constructor() {
    this.form = this.fb.group({
      codigo: [''],
      nombre: ['', Validators.required],
      descripcion: [''],
      unidad: ['UND', Validators.required],
      stock_minimo: [0],
      requiere_lote: [1],
      estado: ['ACTIVO'],
    });
    this.formMov = this.fb.group({
      id_insumo: [null, Validators.required],
      id_sede: [null, Validators.required],
      tipo_movimiento: ['INGRESO', Validators.required],
      cantidad: [1, Validators.required],
      motivo: [''],
      codigo_lote: [''],
      fecha_vencimiento: [''],
    });
  }

  ngOnInit() {
    this.cargarAlertas();
    this.sedesService.findAll(1, 100, '').subscribe({
      next: (res: any) => this.sedes.set(res.data?.data || res.data || []),
    });
  }

  cargarAlertas() {
    this.service.getAlertas(this.sedeCtx.idSedeFiltro()).subscribe({
      next: (res: any) => {
        const data = res.data?.data || res.data || {};
        this.alertas.set({
          stock_bajo: data.stock_bajo || data.stockBajo || [],
          por_vencer: data.por_vencer || data.porVencer || [],
        });
      },
      error: () => this.alertas.set({ stock_bajo: [], por_vencer: [] }),
    });
  }

  onSearch(term: string) { this.crud.searchControl.setValue(term); }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (item) {
      this.alert.showLoading('Cargando...');
      this.service.findOne(item.id_insumo).subscribe({
        next: (res: any) => {
          this.alert.closeLoading();
          const data = res.data?.data || res.data;
          this.crud.setupModal(data.id_insumo);
          this.form.patchValue(data);
          this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
        },
        error: () => { this.alert.closeLoading(); this.alert.error('No se pudo cargar.'); },
      });
    } else {
      this.crud.setupModal(null);
      this.form.reset({ unidad: 'UND', stock_minimo: 0, requiere_lote: 1, estado: 'ACTIVO' });
      this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
    }
  }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.crud.save(this.form.getRawValue(), () => this.cargarAlertas());
  }

  abrirMovimiento(modalTemplate: TemplateRef<any>) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.insumos.set(this.crud.resource().data || []);
    this.formMov.reset({
      tipo_movimiento: 'INGRESO',
      cantidad: 1,
      id_sede: this.sedeCtx.idSedeFiltro(),
    });
    this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
  }

  guardarMovimiento() {
    if (this.formMov.invalid) { this.formMov.markAllAsTouched(); return; }
    this.service.crearMovimiento(this.formMov.getRawValue()).subscribe({
      next: () => {
        this.alert.success('Movimiento registrado');
        this.crud.closeModal();
        this.crud.refresh();
        this.cargarAlertas();
      },
      error: (err: any) => this.alert.error(err.error?.mensaje || err.error?.message || 'Error al registrar'),
    });
  }
}
