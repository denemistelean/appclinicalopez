import { Component, inject, TemplateRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { useCrud } from 'src/app/core/utils/crud.util';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { NotificacionesService } from './notificaciones.service';

@Component({
  selector: 'app-notificaciones',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TableProComponent, FormErrorComponent, NgbModalModule, NgSelectModule],
  templateUrl: './notificaciones.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificacionesComponent {
  private fb = inject(FormBuilder);
  private service = inject(NotificacionesService);
  private alert = inject(AlertService);
  public perms = inject(PermissionsService);
  public crud = useCrud<any>(this.service as any, { itemName: 'Notificación' });
  form: FormGroup;
  canales = [
    { id: 'SISTEMA', nombre: 'SISTEMA' },
    { id: 'EMAIL', nombre: 'EMAIL' },
    { id: 'SMS', nombre: 'SMS' },
    { id: 'WHATSAPP', nombre: 'WHATSAPP' },
  ];

  constructor() {
    this.form = this.fb.group({
      titulo: ['', Validators.required],
      mensaje: ['', Validators.required],
      canal: ['SISTEMA'],
      tipo: ['GENERAL', Validators.required],
    });
  }

  onSearch(term: string) { this.crud.searchControl.setValue(term); }

  abrirModal(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (item) {
      this.alert.showLoading('Cargando...');
      this.service.findOne(item.id_notificacion).subscribe({
        next: (res: any) => {
          this.alert.closeLoading();
          const data = res.data?.data || res.data;
          this.crud.setupModal(data.id_notificacion);
          this.form.patchValue(data);
          this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
        },
        error: () => { this.alert.closeLoading(); this.alert.error('No se pudo cargar.'); },
      });
    } else {
      this.crud.setupModal(null);
      this.form.reset({ canal: 'SISTEMA', tipo: 'GENERAL' });
      this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
    }
  }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.crud.save(this.form.getRawValue());
  }
}
