import { Component, OnInit, TemplateRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
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
import { UnidadContextService } from '../../services/unidad-context.service';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { marcaDeEmpresa } from '../../marca-empresa';
import { RecargaConexion } from '../recarga-conexion';

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
  readonly unidadCtx = inject(UnidadContextService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private recarga = inject(RecargaConexion);

  usuarioLabel = '';
  sedesOptions = signal<{ id_sede: number; nombre: string }[]>([]);
  borradorUnidad = signal<number | null>(null);
  borradorSede = signal<number | null>(null);
  conectando = signal(false);
  sedesListas = signal(false);
  private sedesTicket = 0;

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
    this.unidadCtx.cargar().subscribe({
      next: () => this.prepararConexion(false),
      error: () => this.prepararConexion(false),
    });

    if (this.permissionsService.permissionsSignal().length > 0) {
      this.layoutService.hideLoader();
      return;
    }

    this.permissionsService.loadPermissions().subscribe({
      next: () => this.layoutService.hideLoader(),
      error: () => this.layoutService.hideLoader(),
    });
  }

  conexionDistinta(): boolean {
    if (!this.sedesListas()) return false;
    return this.borradorUnidad() !== this.unidadCtx.idUnidad()
      || this.borradorSede() !== this.sedeCtx.idSedeFiltro();
  }

  elegirEmpresa(id: number | null) {
    if (!id || id === this.borradorUnidad()) return;
    this.borradorUnidad.set(id);
    this.borradorSede.set(null);
    this.cargarSedes(id, true);
  }

  conectar() {
    const idUnidad = this.borradorUnidad();
    if (!idUnidad || this.conectando()) return;
    this.conectando.set(true);
    this.unidadCtx.setUnidad(idUnidad);
    this.sedeCtx.setSede(this.borradorSede());
    this.aplicarMarca(idUnidad);
    this.permissionsService.loadPermissions().subscribe({
      next: () => this.recargarVista(),
      error: () => this.recargarVista(),
    });
  }

  private prepararConexion(soloBorrador: boolean) {
    const id = this.unidadCtx.idUnidad();
    this.borradorUnidad.set(id);
    this.aplicarMarca(id);
    this.cargarSedes(id, soloBorrador);
  }

  private aplicarMarca(id: number | null) {
    const fila = this.unidadCtx.membresias().find((m) => m.id_unidad === id);
    this.layoutService.setTheme(marcaDeEmpresa(fila?.codigo).tema);
  }

  private recargarVista() {
    this.recarga.marcar();
    this.router.navigateByUrl(this.router.url, { onSameUrlNavigation: 'reload' }).finally(() => {
      this.recarga.soltar();
      this.conectando.set(false);
    });
  }

  private cargarSedes(idUnidad: number | null, soloBorrador: boolean) {
    const ticket = ++this.sedesTicket;
    this.sedesListas.set(false);
    if (!idUnidad) {
      this.sedesOptions.set([]);
      this.borradorSede.set(null);
      this.sedesListas.set(true);
      return;
    }
    this.http.get<any>(`${environment.apiUrlGestion}/sedes`, {
      params: { page: '1', limit: '100', estado: 'ACTIVA' },
      headers: { 'X-Unidad-Id': String(idUnidad) },
    }).subscribe({
      next: (res) => {
        if (ticket !== this.sedesTicket) return;
        const rows = res?.data?.data || res?.data || [];
        const list = (Array.isArray(rows) ? rows : []).map((s: any) => ({
          id_sede: Number(s.id_sede),
          nombre: s.nombre,
        }));
        this.sedesOptions.set(list);
        this.sedesListas.set(true);
        const preferida = soloBorrador ? this.borradorSede() : this.sedeCtx.idSedeFiltro();
        const elegida = preferida && list.some((s) => s.id_sede === preferida)
          ? preferida
          : (list[0]?.id_sede ?? null);
        this.borradorSede.set(elegida);
        if (!soloBorrador && elegida !== this.sedeCtx.idSedeFiltro()) {
          this.sedeCtx.setSede(elegida);
        }
      },
      error: () => {
        if (ticket !== this.sedesTicket) return;
        this.sedesOptions.set([]);
        this.sedesListas.set(true);
        if (soloBorrador) this.borradorSede.set(null);
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
