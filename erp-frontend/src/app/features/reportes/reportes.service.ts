import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/reportes`;

  findAll(page: number, limit: number, search: string): Observable<any> {
    let params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    if (search) params = params.set('search', search);
    return this.http.get(`${this.apiUrl}/resumen`, { params });
  }

  create(_data: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/resumen`);
  }

  update(_id: number, _data: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/resumen`);
  }

  delete(_id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/resumen`);
  }

  getResumen(params?: Record<string, any>): Observable<any> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && v !== '') httpParams = httpParams.set(k, String(v));
      });
    }
    return this.http.get(`${this.apiUrl}/resumen`, { params: httpParams });
  }

  getCitasPorEstado(params?: Record<string, any>): Observable<any> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && v !== '') httpParams = httpParams.set(k, String(v));
      });
    }
    return this.http.get(`${this.apiUrl}/citas-por-estado`, { params: httpParams });
  }

  getInformePaciente(idPaciente: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/paciente/${idPaciente}`);
  }
}
