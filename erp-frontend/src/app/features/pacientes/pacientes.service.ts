import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PacientesService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/pacientes`;

  findAll(page: number, limit: number, search: string): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (search) params = params.set('search', search);
    return this.http.get(this.apiUrl, { params });
  }

  findOne(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  create(data: any): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  update(id: number, data: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}`, data);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  buscarDuplicados(params: Record<string, any>): Observable<any> {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') httpParams = httpParams.set(k, String(v));
    });
    return this.http.get(`${this.apiUrl}/buscar-duplicados`, { params: httpParams });
  }

  fusionar(idPrincipal: number, idDuplicado: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/fusionar`, { id_principal: idPrincipal, id_duplicado: idDuplicado });
  }

  getResumen(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/resumen`);
  }

  getDocumentos(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/documentos`);
  }

  getHistoriaResumen(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/historia-resumen`);
  }

  listHistoria(id: number, recurso: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/${recurso}`);
  }

  addHistoria(id: number, recurso: string, datos: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/${recurso}`, { datos });
  }

  updateHistoria(id: number, recurso: string, itemId: number, datos: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/${recurso}/${itemId}`, { datos });
  }

  removeHistoria(id: number, recurso: string, itemId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}/${recurso}/${itemId}`);
  }

  getAlergias(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/alergias`);
  }
}
