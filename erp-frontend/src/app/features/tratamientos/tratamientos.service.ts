import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TratamientosService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/tratamientos`;

  findAll(page: number, limit: number, search: string, filters?: Record<string, any>): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (search) params = params.set('search', search);
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
      });
    }
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

  getReglas(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/reglas`);
  }
}
