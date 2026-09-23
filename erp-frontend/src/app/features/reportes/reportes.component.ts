import { Component, inject, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { SedesService } from '../sedes/sedes.service';
import { ReportesService } from './reportes.service';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgSelectModule],
  templateUrl: './reportes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportesComponent implements OnInit {
  private service = inject(ReportesService);
  private sedesService = inject(SedesService);
  public perms = inject(PermissionsService);

  sedes = signal<any[]>([]);
  resumen = signal<any>(null);
  citasEstado = signal<any[]>([]);
  loading = signal(false);

  idSede = new FormControl<number | null>(null);
  fechaDesde = new FormControl(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  fechaHasta = new FormControl(new Date().toISOString().slice(0, 10));

  ngOnInit() {
    this.sedesService.findAll(1, 100, '').subscribe({
      next: (res: any) => this.sedes.set(res.data?.data || res.data || []),
    });
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    const params = {
      id_sede: this.idSede.value,
      fecha_desde: this.fechaDesde.value,
      fecha_hasta: this.fechaHasta.value,
    };
    this.service.getResumen(params).subscribe({
      next: (res: any) => {
        this.resumen.set(res.data?.data || res.data || {});
        this.loading.set(false);
      },
      error: () => { this.resumen.set({}); this.loading.set(false); },
    });
    this.service.getCitasPorEstado(params).subscribe({
      next: (res: any) => this.citasEstado.set(res.data?.data || res.data || []),
      error: () => this.citasEstado.set([]),
    });
  }
}
