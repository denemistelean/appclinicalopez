import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class MapaCorporalService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/mapa-corporal`;

  list(idPaciente: number): Observable<any> {
    const params = new HttpParams().set('id_paciente', String(idPaciente)).set('limit', '200');
    return this.http.get(this.apiUrl, { params });
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
}
