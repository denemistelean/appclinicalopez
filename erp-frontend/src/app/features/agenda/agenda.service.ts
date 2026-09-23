import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AgendaService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlGestion}/agenda`;

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
    return this.http.get(`${this.apiUrl}/citas`, { params });
  }

  dia(fecha: string, idSede: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/dia`, {
      params: new HttpParams().set('fecha', fecha).set('id_sede', String(idSede)),
    });
  }

  findOne(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/citas/${id}`);
  }

  create(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/citas`, data);
  }

  update(id: number, data: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/citas/${id}`, data);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/citas/${id}`);
  }

  validar(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/citas/validar`, data);
  }

  sugerirHorario(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/citas/sugerir-horario`, data);
  }

  cancelar(id: number, motivo: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/citas/${id}/cancelar`, { motivo });
  }

  completar(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/citas/${id}/completar`, {});
  }

  cambiarEstado(id: number, estado: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/citas/${id}/estado`, { estado });
  }

  listaEspera(filters?: Record<string, any>): Observable<any> {
    let params = new HttpParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v != null && v !== '') params = params.set(k, String(v));
      });
    }
    return this.http.get(`${this.apiUrl}/lista-espera`, { params });
  }

  addListaEspera(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/lista-espera`, data);
  }

  paquetesPaciente(idPaciente: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/pacientes/${idPaciente}/paquetes`);
  }

  tiposCita(): Observable<any> {
    return this.http.get(`${this.apiUrl}/tipos-cita`);
  }

  rolesRecurso(): Observable<any> {
    return this.http.get(`${this.apiUrl}/roles-recurso`);
  }
}
