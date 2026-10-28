import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/dashboard`;

  getResumen(idSucursal?: number | null): Observable<any> {
    let params = new HttpParams();
    if (idSucursal) params = params.set('id_sucursal', String(idSucursal));
    return this.http.get(`${this.apiUrl}/resumen`, { params });
  }

  previewRecordatorio(data: {
    id_cita: number;
    id_plantilla?: number;
    cuerpo?: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/recordatorio/preview`, data);
  }

  listPlantillas(): Observable<any> {
    return this.http.get(`${this.apiUrl}/plantillas`);
  }

  crearPlantilla(data: { nombre: string; cuerpo: string; codigo?: string; canal?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/plantillas`, data);
  }

  actualizarPlantilla(
    id: number,
    data: { nombre?: string; cuerpo?: string; canal?: string; activo?: boolean },
  ): Observable<any> {
    return this.http.patch(`${this.apiUrl}/plantillas/${id}`, data);
  }

  eliminarPlantilla(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/plantillas/${id}`);
  }
}
