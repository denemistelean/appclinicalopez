import { Component, inject, OnInit, TemplateRef, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormControl } from '@angular/forms';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { firstValueFrom } from 'rxjs';

import { useCrud } from 'src/app/core/utils/crud.util';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { TratamientosService } from './tratamientos.service';
import { PersonalService } from '../personal/personal.service';

@Component({
  selector: 'app-tratamientos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TableProComponent, FormErrorComponent, NgbModalModule, NgSelectModule],
  templateUrl: './tratamientos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TratamientosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(TratamientosService);
  private personalService = inject(PersonalService);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);

  public crud = useCrud<any>(this.service as any, { itemName: 'Tratamiento' });

  form: FormGroup;
  filtroCategoria = new FormControl('');
  filtroEstado = new FormControl('');
  especialidades = signal<any[]>([]);

  /** Crear especialidad al vuelo y refrescar el catálogo del select */
  crearEspecialidadTag = async (nombre: string) => {
    const n = String(nombre || '').trim().toUpperCase();
    if (!n) return null as any;
    try {
      const res: any = await firstValueFrom(this.personalService.createEspecialidad({ nombre: n }));
      const id = Number(res?.data?.id ?? res?.id);
      if (!Number.isFinite(id) || id <= 0) {
        this.alert.error('No se pudo crear la especialidad.');
        return null as any;
      }
      const item = { id_especialidad: id, nombre: n };
      this.especialidades.update((list) =>
        list.some((x) => Number(x.id_especialidad) === id) ? list : [...list, item],
      );
      return item;
    } catch {
      this.alert.error('No se pudo crear la especialidad.');
      return null as any;
    }
  };

  estados = [
    { id: 'ACTIVO', nombre: 'ACTIVO' },
    { id: 'INACTIVO', nombre: 'INACTIVO' },
  ];
  siNo = [
    { id: true, nombre: 'Sí' },
    { id: false, nombre: 'No' },
  ];

  constructor() {
    this.form = this.fb.group({
      codigo: [''],
      nombre: ['', Validators.required],
      descripcion: [''],
      categoria: [''],
      id_especialidad: [null],
      duracion_minutos: [30, Validators.required],
      precio_base: [0, Validators.required],
      requiere_equipo: [false],
      requiere_sala: [true],
      intervalo_minutos: [null],
      estado: ['ACTIVO', Validators.required],
    });
  }

  ngOnInit() {
    this.personalService.listEspecialidades().subscribe({
      next: (res: any) => this.especialidades.set(res.data?.data || res.data || res || []),
      error: () => this.especialidades.set([]),
    });
  }

  onSearch(term: string) { this.crud.searchControl.setValue(term); }

  aplicarFiltros() {
    this.crud.page.set(1);
    // useCrud only sends search; refresh with custom findAll via service wrapper
    this.crud.refresh();
  }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (item) {
      this.alert.showLoading('Cargando tratamiento...');
      this.service.findOne(item.id_tratamiento).subscribe({
        next: (res: any) => {
          this.alert.closeLoading();
          const data = res.data?.data || res.data;
          this.crud.setupModal(data.id_tratamiento);
          this.form.patchValue({
            ...data,
            precio_base: Number(data.precio_base ?? 0),
            duracion_minutos: Number(data.duracion_minutos ?? 30),
            intervalo_minutos:
              data.intervalo_minutos == null || data.intervalo_minutos === ''
                ? null
                : Number(data.intervalo_minutos),
            id_especialidad: data.id_especialidad != null ? Number(data.id_especialidad) : null,
            requiere_equipo: !!Number(data.requiere_equipo),
            requiere_sala: !!Number(data.requiere_sala),
          });
          this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
        },
        error: () => { this.alert.closeLoading(); this.alert.error('No se pudo cargar.'); },
      });
    } else {
      this.crud.setupModal(null);
      this.form.reset({ duracion_minutos: 30, precio_base: 0, requiere_equipo: false, requiere_sala: true, estado: 'ACTIVO' });
      this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
    }
  }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const raw = this.form.getRawValue();
    this.crud.save({
      ...raw,
      precio_base: Number(raw.precio_base ?? 0),
      duracion_minutos: Number(raw.duracion_minutos ?? 30),
      intervalo_minutos:
        raw.intervalo_minutos == null || raw.intervalo_minutos === ''
          ? null
          : Number(raw.intervalo_minutos),
      id_especialidad: raw.id_especialidad != null ? Number(raw.id_especialidad) : null,
      requiere_equipo: !!raw.requiere_equipo,
      requiere_sala: !!raw.requiere_sala,
    });
  }
}
