import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DocumentosService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/documentos`;

  findAll(page: number, limit: number, search: string, extra?: Record<string, any>): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (search) params = params.set('search', search);
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => {
        if (v != null && v !== '') params = params.set(k, String(v));
      });
    }
    return this.http.get(this.apiUrl, { params });
  }

  findOne(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  /** Compat useCrud — create no aplica (se usa upload) */
  create(_data: any): Observable<any> {
    throw new Error('Use upload()');
  }

  update(id: number, data: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}`, data);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  upload(formData: FormData): Observable<any> {
    return this.http.post(this.apiUrl, formData);
  }

  archivoUrl(id: number): string {
    return `${this.apiUrl}/${id}/archivo`;
  }

  listTipos(search = ''): Observable<any> {
    let params = new HttpParams().set('limit', '200').set('activo', '1');
    if (search) params = params.set('search', search);
    return this.http.get(`${this.apiUrl}/tipos`, { params });
  }

  listTiposAll(page = 1, limit = 50, search = ''): Observable<any> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (search) params = params.set('search', search);
    return this.http.get(`${this.apiUrl}/tipos`, { params });
  }

  createTipo(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/tipos`, data);
  }

  updateTipo(id: number, data: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/tipos/${id}`, data);
  }

  deleteTipo(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/tipos/${id}`);
  }

  consultasPaciente(idPaciente: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/consultas-paciente/${idPaciente}`);
  }

  getRaiz(): Observable<any> {
    return this.http.get(`${this.apiUrl}/config/raiz`);
  }
}
