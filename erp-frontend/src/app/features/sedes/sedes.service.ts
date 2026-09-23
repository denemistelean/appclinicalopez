import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SedesService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/sedes`;

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

  listTiposEquipo(): Observable<any> {
    return this.http.get(`${this.apiUrl}/tipos-equipo`);
  }

  listSalas(idSede: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${idSede}/salas`);
  }

  createSala(idSede: number, data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${idSede}/salas`, data);
  }

  updateSala(idSala: number, data: any): Observable<any> {
    return this.http.put(`${environment.apiUrlGestion}/salas/${idSala}`, data);
  }

  deleteSala(idSala: number): Observable<any> {
    return this.http.delete(`${environment.apiUrlGestion}/salas/${idSala}`);
  }

  listEquipos(idSede: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${idSede}/equipos`);
  }

  createEquipo(idSede: number, data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${idSede}/equipos`, data);
  }

  updateEquipo(idEquipo: number, data: any): Observable<any> {
    return this.http.put(`${environment.apiUrlGestion}/equipos/${idEquipo}`, data);
  }

  mantenimientoEquipo(idEquipo: number, data: any): Observable<any> {
    return this.http.patch(`${environment.apiUrlGestion}/equipos/${idEquipo}/mantenimiento`, data);
  }
}
