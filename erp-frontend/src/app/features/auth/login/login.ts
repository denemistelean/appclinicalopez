import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from 'src/app/core/services/auth.service';
import { textoPublico } from 'src/app/core/auth/sesion-token';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { UnidadContextService } from 'src/app/core/services/unidad-context.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})
export class Login {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private permsService = inject(PermissionsService);
  private unidad = inject(UnidadContextService);
  private alert = inject(AlertService);
  
  private cdr = inject(ChangeDetectorRef);

  form: FormGroup;
  cargando = false; 
  errorMsg = '';    

  constructor() {
    this.form = this.fb.group({
      email: ['', [Validators.required]],
      password: ['', Validators.required]
    });
    if (sessionStorage.getItem('cli_aviso') === 'sin_confirmar') {
      sessionStorage.removeItem('cli_aviso');
      this.errorMsg = 'Se cerró la sesión en este equipo, pero no se pudo confirmar la revocación en el servidor.';
    }
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando = true;
    this.errorMsg = '';

    const payload = {
      correo: this.form.value.email,
      password: this.form.value.password
    };

    this.authService.login(payload).subscribe({
      next: () => {
        if (this.authService.tieneAccess()) {
          this.verificarAcceso();
        } else {
          this.errorMsg = 'La respuesta de acceso está incompleta.';
          this.cargando = false;
          this.cdr.detectChanges();
        }
      },
      error: (err: { message?: string; status?: number; error?: unknown }) => {
        this.errorMsg = err?.message === 'respuesta_incompleta'
          ? 'La respuesta de acceso está incompleta.'
          : textoPublico(err);
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  verificarAcceso() {
    this.unidad.cargar().subscribe({
      next: () => {
        if (!this.unidad.idUnidad() || !this.unidad.membresias().length) {
          this.rechazarIngreso('Su usuario no tiene empresa asignada. Pida a un administrador que le asigne unidad y rol.');
          return;
        }
        this.cargarPermisos();
      },
      error: () =>
        this.rechazarIngreso('No se pudieron cargar las empresas del usuario. Intente de nuevo o contacte a soporte.'),
    });
  }

  private cargarPermisos() {
    this.permsService.loadPermissions().subscribe({
      next: (res: any) => {
        const listaPermisos = res.data?.data?.permisos || res.data?.permisos || res.permisos || [];
        if (listaPermisos.length > 0) {
          this.router.navigate(['/agenda']);
          return;
        }
        this.rechazarIngreso(
          'Su usuario no tiene permisos en la empresa activa. Revise el rol asignado en esa unidad.',
        );
      },
      error: () =>
        this.rechazarIngreso(
          'No se pudieron cargar los permisos. Elija otra empresa o revise el rol asignado.',
        ),
    });
  }

  rechazarIngreso(mensaje?: string) {
    this.authService.revocarSinSalir();
    this.unidad.clear();
    this.alert.toast(mensaje || 'No se pudo completar el ingreso.', 'warning');
    setTimeout(() => {
      this.errorMsg = mensaje || 'Su usuario no tiene roles configurados en el sistema.';
      this.cargando = false;
      this.cdr.detectChanges();
    }, 0);
  }
}