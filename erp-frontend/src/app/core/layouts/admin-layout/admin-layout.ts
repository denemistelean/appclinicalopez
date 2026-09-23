import { Component, OnInit, TemplateRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NgbDropdownModule, NgbModal, NgbModalModule, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { Sidebar } from '../sidebar/sidebar';
import { SettingsPanel } from '../settings-panel/settings-panel';
import { ToastComponent } from '../../components/toast/toast';
import { LayoutService } from '../../services/layout.service';
import { PermissionsService } from '../../services/seguridad/permissions.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/ui/alert.service';
import { SedeContextService } from '../../services/sede-context.service';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    NgbModalModule,
    NgbDropdownModule,
    NgSelectModule,
    Sidebar,
    SettingsPanel,
    ToastComponent,
  ],
  templateUrl: './admin-layout.html',
  styleUrls: ['./admin-layout.scss'],
})
export class AdminLayout implements OnInit {
  public layoutService = inject(LayoutService);
  private permissionsService = inject(PermissionsService);
  private auth = inject(AuthService);
  private modal = inject(NgbModal);
  private alert = inject(AlertService);
  private fb = inject(FormBuilder);
  readonly sedeCtx = inject(SedeContextService);
  private http = inject(HttpClient);

  usuarioLabel = '';
  sedesOptions = signal<{ id_sede: number | 'TODAS'; nombre: string }[]>([
    { id_sede: 'TODAS', nombre: 'Todas las sedes' },
  ]);

  claveForm = this.fb.group({
    clave_actual: ['', Validators.required],
    clave_nueva: ['', [Validators.required, Validators.minLength(6)]],
    clave_nueva2: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit() {
    try {
      const u = JSON.parse(localStorage.getItem('usuario') || '{}');
      this.usuarioLabel = [u.nombres, u.apellidos].filter(Boolean).join(' ') || u.correo || 'Usuario';
    } catch {
      this.usuarioLabel = 'Usuario';
    }

    this.layoutService.showLoader();
    this.cargarSedesSelector();

    if (this.permissionsService.permissionsSignal().length > 0) {
      this.layoutService.hideLoader();
      return;
    }

    this.permissionsService.loadPermissions().subscribe({
      next: () => this.layoutService.hideLoader(),
      error: () => this.layoutService.hideLoader(),
    });
  }

  onSedeChange(id: number | 'TODAS' | null) {
    this.sedeCtx.setSede(id === null ? 'TODAS' : id);
  }

  private cargarSedesSelector() {
    this.http.get<any>(`${environment.apiUrlGestion}/sedes`, {
      params: { page: '1', limit: '100', estado: 'ACTIVA' },
    }).subscribe({
      next: (res) => {
        const rows = res?.data?.data || res?.data || [];
        const list = Array.isArray(rows) ? rows : [];
        this.sedesOptions.set([
          { id_sede: 'TODAS', nombre: 'Todas las sedes' },
          ...list.map((s: any) => ({ id_sede: s.id_sede, nombre: s.nombre })),
        ]);
      },
      error: () => {
        // Sedes aún no disponibles (fase temprana o sin permiso): selector queda en "Todas"
      },
    });
  }

  abrirCambiarClave(tpl: TemplateRef<any>) {
    this.claveForm.reset();
    this.modal.open(tpl, { centered: true, backdrop: 'static' });
  }

  guardarClave(modal: NgbModalRef) {
    if (this.claveForm.invalid) {
      this.claveForm.markAllAsTouched();
      return;
    }
    const raw = this.claveForm.getRawValue();
    if (raw.clave_nueva !== raw.clave_nueva2) {
      this.alert.warning('La confirmación de clave no coincide.');
      return;
    }
    this.alert.showLoading('Actualizando clave...');
    this.auth.cambiarClave(String(raw.clave_actual), String(raw.clave_nueva)).subscribe({
      next: () => {
        this.alert.closeLoading();
        this.alert.success('Clave actualizada.');
        modal.close();
      },
      error: (e) => {
        this.alert.closeLoading();
        this.alert.error(e.error?.mensaje || e.error?.message || 'No se pudo cambiar la clave.');
      },
    });
  }

  cerrarSesion() {
    this.auth.logout();
  }
}
