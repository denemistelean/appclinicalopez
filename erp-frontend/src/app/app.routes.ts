import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { permissionGuard } from './core/guards/permission.guard';
import { AdminLayout } from './core/layouts/admin-layout/admin-layout';

export const routes: Routes = [
  {
    path: 'auth/login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.Login)
  },

  {
    path: '',
    component: AdminLayout,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_dashboard' },
      },
      {
        path: 'admin/seguridad/permisos',
        loadComponent: () => import('./features/permisos/permisos.component').then(m => m.PermisosComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_seguridad' },
      },
      {
        path: 'admin/usuarios',
        loadComponent: () => import('./features/usuarios/usuarios.component').then(m => m.UsuariosComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_usuario' },
      },

      {
        path: 'sedes',
        loadComponent: () => import('./features/sedes/sedes.component').then(m => m.SedesComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_sede' },
      },
      {
        path: 'personal',
        loadComponent: () => import('./features/personal/personal.component').then(m => m.PersonalComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_personal' },
      },
      {
        path: 'tratamientos',
        loadComponent: () => import('./features/tratamientos/tratamientos.component').then(m => m.TratamientosComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_tratamiento' },
      },
      {
        path: 'inventario',
        loadComponent: () => import('./features/inventario/inventario.component').then(m => m.InventarioComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_inventario' },
      },
      {
        path: 'pacientes',
        loadComponent: () => import('./features/pacientes/pacientes.component').then(m => m.PacientesComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_paciente' },
      },
      {
        path: 'pacientes/:id',
        loadComponent: () => import('./features/pacientes/paciente-ficha.component').then(m => m.PacienteFichaComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_paciente' },
      },
      {
        path: 'agenda',
        loadComponent: () => import('./features/agenda/agenda.component').then(m => m.AgendaComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_cita' },
      },
      {
        path: 'historia-clinica',
        loadComponent: () => import('./features/historia-clinica/historia-clinica.component').then(m => m.HistoriaClinicaComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_historia_clinica' },
      },
      {
        path: 'documentos',
        loadComponent: () => import('./features/documentos/documentos.component').then(m => m.DocumentosComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_documento' },
      },
      {
        path: 'mapa-corporal',
        loadComponent: () =>
          import('./features/mapa-corporal/mapa-corporal.component').then((m) => m.MapaCorporalComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_mapa_corporal' },
      },
      {
        path: 'consentimientos',
        loadComponent: () => import('./features/consentimientos/consentimientos.component').then(m => m.ConsentimientosComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_consentimiento' },
      },
      {
        path: 'fotos-evolucion',
        loadComponent: () => import('./features/fotos-evolucion/fotos-evolucion.component').then(m => m.FotosEvolucionComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_foto_evolucion' },
      },
      {
        path: 'facturacion',
        loadComponent: () => import('./features/facturacion/facturacion.component').then(m => m.FacturacionComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_facturacion' },
      },
      {
        path: 'notificaciones',
        loadComponent: () => import('./features/notificaciones/notificaciones.component').then(m => m.NotificacionesComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_notificacion' },
      },
      {
        path: 'reportes',
        loadComponent: () => import('./features/reportes/reportes.component').then(m => m.ReportesComponent),
        canActivate: [permissionGuard],
        data: { permiso: 'ver_reporte' },
      },
    ]
  },

  { path: '**', redirectTo: '' }
];
