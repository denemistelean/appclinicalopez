import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class InventarioService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/inventario`;

  findAll(page: number, limit: number, search: string): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (search) params = params.set('search', search);
    return this.http.get(`${this.apiUrl}/insumos`, { params });
  }

  findOne(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/insumos/${id}`);
  }

  create(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/insumos`, data);
  }

  update(id: number, data: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/insumos/${id}`, data);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/insumos/${id}`);
  }

  getAlertas(idSede?: number | null): Observable<any> {
    let params = new HttpParams();
    if (idSede) params = params.set('id_sede', idSede.toString());
    return this.http.get(`${this.apiUrl}/alertas`, { params });
  }

  crearMovimiento(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/movimientos`, data);
  }

  listMovimientos(page: number, limit: number, search = ''): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (search) params = params.set('search', search);
    return this.http.get(`${this.apiUrl}/movimientos`, { params });
  }
}
