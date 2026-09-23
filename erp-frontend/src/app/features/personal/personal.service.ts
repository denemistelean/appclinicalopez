import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PersonalService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/personal`;

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

  getHorario(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/horario`);
  }

  setHorario(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/horario`, data);
  }

  getExcepciones(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/excepciones`);
  }

  addExcepcion(id: number, data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/excepciones`, data);
  }

  getCertificaciones(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/certificaciones`);
  }

  addCertificacion(id: number, data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/certificaciones`, data);
  }

  deleteCertificacion(idPersonal: number, idCert: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${idPersonal}/certificaciones/${idCert}`);
  }

  listEspecialidades(search?: string): Observable<any> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get(`${this.apiUrl}/especialidades`, { params });
  }

  createEspecialidad(data: { nombre: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/especialidades`, data);
  }

  getDisponibilidad(id: number, fecha: string, idSede?: number): Observable<any> {
    let params = new HttpParams().set('fecha', fecha);
    if (idSede) params = params.set('id_sede', idSede.toString());
    return this.http.get(`${this.apiUrl}/${id}/disponibilidad`, { params });
  }
}
