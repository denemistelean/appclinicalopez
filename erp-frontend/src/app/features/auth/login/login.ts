import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from 'src/app/core/services/auth.service';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
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
  private alert = inject(AlertService);
  
  private cdr = inject(ChangeDetectorRef);

  form: FormGroup;
  cargando = false; 
  errorMsg = '';    

  constructor() {
    this.form = this.fb.group({
      email: ['', [Validators.required]], // Quitamos el Validators.email
      password: ['', Validators.required]
    });
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
      next: (res: any) => {
        const tokenReal = res.data?.data?.access_token || res.data?.access_token;

        if (tokenReal) {
           localStorage.setItem('token', tokenReal);
           this.verificarAcceso(); 
        } else {
           this.errorMsg = 'Error: Respuesta del servidor sin token.';
           this.cargando = false;
           this.cdr.detectChanges(); 
        }
      },
      error: (err: any) => {
        console.error(err);
        const mensajeBackend = err.error?.mensaje || 'Credenciales incorrectas o error de conexión.';
        
        this.errorMsg = mensajeBackend;
        this.cargando = false;
        this.cdr.detectChanges(); 
      }
    });
  }

  verificarAcceso() {
    this.permsService.loadPermissions().subscribe({
      next: (res: any) => {
        const listaPermisos = res.data?.data?.permisos || res.data?.permisos || res.permisos || [];
        
        console.log('🔍 Permisos recibidos en Login:', listaPermisos.length);

        if (listaPermisos.length > 0) {
          this.router.navigate(['/dashboard']);
        } else {
          this.rechazarIngreso();
        }
      },
      error: (err) => {
        console.error('Error verificando permisos', err);
        this.rechazarIngreso();
      }
    });
  }

  rechazarIngreso() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    
    this.alert.toast('Usuario válido, pero SIN PERMISOS en BD.', 'warning');

    setTimeout(() => {
      this.errorMsg = 'Su usuario no tiene roles configurados en el sistema.';
      this.cargando = false; 
      this.cdr.detectChanges(); 
    }, 0);
  }
}