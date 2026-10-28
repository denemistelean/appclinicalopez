import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrlGestion}/catalogo-tarifas`;

  listar() {
    return this.http.get<any>(this.api);
  }

  crear(data: unknown) {
    return this.http.post(this.api + '/items', data);
  }

  actualizar(id: number, data: unknown) {
    return this.http.patch(`${this.api}/items/${id}`, data);
  }

  nuevoPrecio(id: number, data: unknown) {
    return this.http.post(`${this.api}/items/${id}/precios`, data);
  }

  crearTecnologia(data: unknown) {
    return this.http.post(`${this.api}/tecnologias`, data);
  }

  tecnologia(id: number, data: unknown) {
    return this.http.patch(`${this.api}/tecnologias/${id}`, data);
  }
}
