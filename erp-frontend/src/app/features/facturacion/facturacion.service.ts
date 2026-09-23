import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FacturacionService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/facturacion`;

  findAll(page: number, limit: number, search: string): Observable<any> {
    let params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    if (search) params = params.set('search', search);
    return this.http.get(`${this.apiUrl}/cotizaciones`, { params });
  }

  findOne(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/cotizaciones/${id}`);
  }

  create(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/cotizaciones`, data);
  }

  update(id: number, data: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/cotizaciones/${id}`, data);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/cotizaciones/${id}`);
  }

  registrarPago(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/pagos`, data);
  }
}
