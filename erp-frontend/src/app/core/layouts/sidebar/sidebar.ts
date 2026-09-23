import { Component, inject, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';

import { LayoutService } from '../../services/layout.service';
import { PermissionsService } from '../../services/seguridad/permissions.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/ui/alert.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.scss'],
  host: {
    '[class.closed]': '!isSidebarOpen()'
  }
})
export class Sidebar implements OnInit {
  layoutService = inject(LayoutService);
  perms = inject(PermissionsService);
  private authService = inject(AuthService);
  private alert = inject(AlertService);
  private router = inject(Router);

  searchControl = new FormControl('');
  searchTerm = toSignal(this.searchControl.valueChanges, { initialValue: '' });
  isSidebarOpen = this.layoutService.sidebarOpen;
  private routeTick = signal(0);

  usuarioActual: any = null;
  logoError = signal(false);

  private rawMenu: any[] = [
    {
      label: 'Dashboard', icon: 'bi-speedometer2',
      route: '/dashboard', type: 'link', permiso: 'ver_dashboard'
    },

    {
      label: 'ADMINISTRACIÓN',
      type: 'dropdown',
      icon: 'bi-shield-lock',
      children: [
        {
          label: 'Usuarios', icon: 'bi-people-fill',
          route: '/admin/usuarios', type: 'link', permiso: 'ver_usuario'
        },
        {
          label: 'Roles y permisos', icon: 'bi-shield-lock-fill',
          route: '/admin/seguridad/permisos', type: 'link', permiso: 'ver_seguridad'
        },
      ],
    },

    {
      label: 'CLÍNICA',
      type: 'dropdown',
      icon: 'bi-hospital',
      children: [
        { label: 'Sedes', icon: 'bi-building', route: '/sedes', type: 'link', permiso: 'ver_sede' },
        { label: 'Personal', icon: 'bi-person-badge', route: '/personal', type: 'link', permiso: 'ver_personal' },
        { label: 'Tratamientos', icon: 'bi-clipboard2-pulse', route: '/tratamientos', type: 'link', permiso: 'ver_tratamiento' },
        // Ocultos temporalmente: Inventario, Consentimientos, Fotos evolución, Facturación, Notificaciones
        { label: 'Pacientes', icon: 'bi-person-vcard', route: '/pacientes', type: 'link', permiso: 'ver_paciente' },
        { label: 'Agenda', icon: 'bi-calendar2-week', route: '/agenda', type: 'link', permiso: 'ver_cita' },
        { label: 'Historia clínica', icon: 'bi-journal-medical', route: '/historia-clinica', type: 'link', permiso: 'ver_historia_clinica' },
        { label: 'Documentos', icon: 'bi-folder2-open', route: '/documentos', type: 'link', permiso: 'ver_documento' },
        { label: 'Mapa corporal 3D', icon: 'bi-person-bounding-box', route: '/mapa-corporal', type: 'link', permiso: 'ver_mapa_corporal' },
        { label: 'Reportes', icon: 'bi-graph-up', route: '/reportes', type: 'link', permiso: 'ver_reporte' },
      ],
    },
  ];

  ngOnInit() {
    const userStr = localStorage.getItem('usuario');
    if (userStr) {
      try {
        this.usuarioActual = JSON.parse(userStr);
      } catch {
        // silencioso
      }
    }

    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.routeTick.update((n) => n + 1);
      this.expandActiveGroups();
    });
    this.expandActiveGroups();
  }

  filteredMenu = computed(() => {
    this.routeTick();
    const text = (this.searchTerm() || '').toLowerCase();
    const isSearching = text.length > 0;
    const permsLoaded = this.perms.permissionsSignal().length > 0;

    const result = this.rawMenu.map((item) => {
      if (item.type === 'link') {
        if (permsLoaded && item.permiso && !this.perms.hasPermission(item.permiso)) return null;
        if (isSearching && !item.label.toLowerCase().includes(text)) return null;
        return { ...item };
      }

      if (item.type === 'dropdown') {
        let children = (item.children || []).filter((sub: any) => {
          if (permsLoaded && sub.permiso && !this.perms.hasPermission(sub.permiso)) return false;
          return true;
        });

        if (isSearching) {
          children = children.filter((sub: any) =>
            sub.label.toLowerCase().includes(text) || item.label.toLowerCase().includes(text)
          );
        }

        if (!children.length) return null;

        const active = isSearching || this.hasActiveChild({ ...item, children });
        return {
          ...item,
          children,
          active: item.active === true || active,
        };
      }

      return null;
    }).filter((x) => x !== null);

    return result;
  });

  toggleSubmenu(item: any) {
    item.active = !item.active;
    // Persiste el estado en rawMenu para no perder al recomputar
    const raw = this.rawMenu.find((m) => m.label === item.label && m.type === 'dropdown');
    if (raw) raw.active = item.active;
  }

  isChildActive(item: any): boolean {
    return this.hasActiveChild(item);
  }

  isExactActive(route: string): boolean {
    this.routeTick();
    const url = this.router.url.split('?')[0];
    return url === route || url === `${route}/`;
  }

  checkMobileClose() {
    if (window.innerWidth < 992) {
      this.layoutService.sidebarOpen.set(false);
    }
  }

  private expandActiveGroups() {
    for (const item of this.rawMenu) {
      if (item.type === 'dropdown' && this.hasActiveChild(item)) {
        item.active = true;
      }
    }
  }

  private hasActiveChild(item: any): boolean {
    if (!item.children) return false;
    const url = this.router.url.split('?')[0];
    return item.children.some((sub: any) => {
      if (!sub.route) return false;
      if (url === sub.route || url === `${sub.route}/`) return true;
      // ficha detalle bajo listado (ej. /pacientes/12)
      if (sub.route === '/pacientes' && url.startsWith('/pacientes/')) return true;
      return false;
    });
  }

  logout() {
    this.alert.confirmAction('¿Cerrar Sesión?', 'Saldrás del sistema.', 'Sí, salir')
      .then((ok) => { if (ok) this.authService.logout(); });
  }
}
