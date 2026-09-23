import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class HistoriaClinicaService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/historia-clinica`;

  findAll(page: number, limit: number, search: string, filters?: Record<string, any>): Observable<any> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (search) params = params.set('search', search);
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v != null && v !== '') params = params.set(k, String(v));
      });
    }
    return this.http.get(`${this.apiUrl}/consultas`, { params });
  }

  findOne(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/consultas/${id}`);
  }

  create(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/consultas`, data);
  }

  update(id: number, data: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/consultas/${id}`, data);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/consultas/${id}`);
  }

  finalizar(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/consultas/${id}/finalizar`, {});
  }

  listPlantillas(): Observable<any> {
    return this.http.get(`${this.apiUrl}/plantillas`, {
      params: new HttpParams().set('limit', '100'),
    });
  }

  buscarCie10(term: string): Observable<any> {
    let params = new HttpParams();
    if (term) params = params.set('search', term);
    return this.http.get(`${this.apiUrl}/cie10`, { params });
  }

  buscarMedicamentos(term: string): Observable<any> {
    let params = new HttpParams();
    if (term) params = params.set('search', term);
    return this.http.get(`${this.apiUrl}/medicamentos`, { params });
  }

  historialPaciente(idPaciente: number): Observable<any> {
    return this.findAll(1, 50, '', { id_paciente: idPaciente });
  }
}
