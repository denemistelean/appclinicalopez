import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { AlertService } from 'src/app/core/services/ui/alert.service';
import { DashboardService } from './dashboard.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private service = inject(DashboardService);
  private alert = inject(AlertService);

  loading = signal(true);
  indicadores = signal<any>({});
  citasSemana = signal<any[]>([]);
  plantillas = signal<any[]>([]);
  citaSel = signal<any>(null);
  plantillaId = signal<number | null>(null);
  mensajePreview = signal('');
  waUrl = signal<string | null>(null);
  cargandoMensaje = signal(false);

  editandoPlantilla = signal<any | null>(null);
  formNombre = signal('');
  formCuerpo = signal('');
  guardandoPlantilla = signal(false);

  readonly ayudaPlaceholders =
    '{{saludo}} {{nombre}} {{paciente}} {{fecha}} {{hora}} {{tratamiento}} {{personal}} {{sede}} {{clinica}}';

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.service
      .getResumen()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res: any) => {
          const data = res?.data ?? res ?? {};
          this.indicadores.set(data.indicadores || data.totales || {});
          this.citasSemana.set(data.citas_semana || []);
          this.plantillas.set(data.plantillas_recordatorio || []);
          // Si ya había cita seleccionada, refrescar mensaje
          if (this.citaSel()?.id_cita) {
            this.armarMensaje();
          }
        },
        error: (err) => this.alert.error(err?.error?.message || 'No se pudo cargar el dashboard'),
      });
  }

  seleccionarCita(c: any) {
    this.citaSel.set(c);
    this.mensajePreview.set('');
    this.waUrl.set(null);
    const actual = this.plantillaId();
    const sigue =
      actual != null && this.plantillas().some((p) => Number(p.id_plantilla) === Number(actual));
    if (!sigue) {
      const primera = this.plantillas().find((p) => Number(p.activo) !== 0) || this.plantillas()[0];
      this.plantillaId.set(primera ? Number(primera.id_plantilla) : null);
    }
    this.armarMensaje();
  }

  onPlantillaChange(v: any) {
    this.plantillaId.set(v != null && v !== '' ? Number(v) : null);
    this.armarMensaje();
  }

  /** Completa el texto con datos de la cita + plantilla elegida. */
  armarMensaje() {
    const c = this.citaSel();
    if (!c?.id_cita) return;
    this.cargandoMensaje.set(true);
    this.service
      .previewRecordatorio({
        id_cita: Number(c.id_cita),
        id_plantilla: this.plantillaId() || undefined,
        // sin cuerpo: siempre usa la plantilla (o el genérico)
      })
      .pipe(finalize(() => this.cargandoMensaje.set(false)))
      .subscribe({
        next: (res: any) => {
          const body = res?.data ?? res ?? {};
          // Preferir `texto` (el interceptor global se apropia de `mensaje`)
          const texto = String(body.texto || body.mensaje || '').trim();
          this.mensajePreview.set(texto);
          this.waUrl.set(body.whatsapp_url || null);
          if (!texto) {
            this.alert.warning('La plantilla no devolvió texto. Revise el contenido guardado.');
          }
        },
        error: (err) => {
          this.mensajePreview.set('');
          this.waUrl.set(null);
          this.alert.error(
            err?.error?.mensaje || err?.error?.message || 'No se pudo armar el mensaje',
          );
        },
      });
  }

  onMensajeEdit(texto: string) {
    this.mensajePreview.set(texto);
    // Actualiza el query text del wa.me si ya hay URL base
    const url = this.waUrl();
    if (url && texto) {
      try {
        const u = new URL(url);
        u.searchParams.set('text', texto);
        this.waUrl.set(u.toString());
      } catch {
        /* ignore */
      }
    }
  }

  abrirWhatsApp() {
    const texto = this.mensajePreview().trim();
    if (!texto) {
      this.alert.warning('Seleccione una cita y una plantilla para armar el mensaje');
      return;
    }
    let url = this.waUrl();
    const c = this.citaSel();
    const tel = String(c?.telefono || c?.telefono_whatsapp || '').replace(/\D/g, '');
    if (!tel && !url) {
      this.alert.warning('El paciente no tiene nro. WhatsApp. Complételo en su ficha.');
      return;
    }
    if (!url) {
      let n = tel;
      if (!(n.startsWith('51') && n.length >= 11) && n.length === 9) n = `51${n}`;
      url = `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
    } else {
      try {
        const u = new URL(url);
        u.searchParams.set('text', texto);
        url = u.toString();
      } catch {
        /* keep */
      }
    }
    window.open(url, '_blank');
  }

  nuevaPlantilla() {
    this.editandoPlantilla.set({ id_plantilla: null });
    this.formNombre.set('Recordatorio de cita');
    this.formCuerpo.set(
      '{{saludo}} {{nombre}}, le recordamos su cita del día {{fecha}} a las {{hora}} ({{tratamiento}}). Favor de llegar 10 minutos antes. ¡Le esperamos en {{clinica}}!',
    );
  }

  editarPlantilla(p: any) {
    this.editandoPlantilla.set(p);
    this.formNombre.set(String(p.nombre || ''));
    this.formCuerpo.set(String(p.cuerpo || ''));
  }

  cancelarPlantilla() {
    this.editandoPlantilla.set(null);
    this.formNombre.set('');
    this.formCuerpo.set('');
  }

  guardarPlantilla() {
    const nombre = this.formNombre().trim();
    const cuerpo = this.formCuerpo().trim();
    if (!nombre || !cuerpo) {
      this.alert.warning('Complete nombre y texto de la plantilla');
      return;
    }
    const edit = this.editandoPlantilla();
    this.guardandoPlantilla.set(true);
    const req =
      edit?.id_plantilla != null
        ? this.service.actualizarPlantilla(Number(edit.id_plantilla), { nombre, cuerpo })
        : this.service.crearPlantilla({ nombre, cuerpo });
    req.pipe(finalize(() => this.guardandoPlantilla.set(false))).subscribe({
      next: () => {
        this.alert.success(edit?.id_plantilla != null ? 'Plantilla actualizada' : 'Plantilla guardada');
        this.cancelarPlantilla();
        this.cargar();
      },
      error: (err) => this.alert.error(err?.error?.mensaje || err?.error?.message || 'No se pudo guardar'),
    });
  }

  eliminarPlantilla(p: any) {
    const id = Number(p?.id_plantilla || 0);
    if (!id) return;
    if (!confirm(`¿Eliminar la plantilla «${p.nombre}»?`)) return;
    this.service.eliminarPlantilla(id).subscribe({
      next: () => {
        this.alert.success('Plantilla eliminada');
        if (this.plantillaId() === id) this.plantillaId.set(null);
        this.cargar();
      },
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo eliminar'),
    });
  }

  labelEstado(e: string): string {
    const map: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      CONFIRMADA: 'Confirmada',
      REPROGRAMADA: 'Reprogramada',
      EN_ATENCION: 'En atención',
      FINALIZADA: 'Finalizada',
    };
    return map[e] || e || '—';
  }
}
