import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class HistoriaDigitalService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrlGestion}/historia-digital`;
  private unidadesApi = `${environment.apiUrlGestion}/unidades`;

  ficha(id: number) {
    return this.http.get(`${this.api}/pacientes/${id}`);
  }

  guardar(id: number, data: any) {
    return this.http.patch(`${this.api}/pacientes/${id}`, data);
  }

  reniec(numero: string) {
    return this.http.post(`${this.api}/reniec`, { numero_documento: numero });
  }

  evaluacion(id: number, data: any) {
    return this.http.post(`${this.api}/pacientes/${id}/evaluaciones`, data);
  }

  quitarEvaluacion(id: number) {
    return this.http.delete(`${this.api}/evaluaciones/${id}`);
  }

  cirugia(id: number, data: any) {
    return this.http.post(`${this.api}/pacientes/${id}/cirugias`, data);
  }

  quitarCirugia(id: number) {
    return this.http.delete(`${this.api}/cirugias/${id}`);
  }

  paquete(id: number, data: any) {
    return this.http.post(`${this.api}/pacientes/${id}/paquetes`, data);
  }

  bajarPlan(
    idPaquete: number,
    data: { motivo: string; monto_devolucion?: number; monto_retenido?: number },
  ) {
    return this.http.post(`${this.api}/paquetes/${idPaquete}/baja`, data);
  }

  usarSesion(id: number) {
    return this.http.post(`${this.api}/paquetes/${id}/sesion`, {});
  }

  pago(id: number, data: any) {
    return this.http.post(`${this.api}/pacientes/${id}/pagos`, data);
  }

  ajustarPago(idPago: number, data: any) {
    return this.http.patch(`${this.api}/pagos/${idPago}`, data);
  }

  anularPago(idPago: number, motivo: string) {
    return this.http.post(`${this.api}/pagos/${idPago}/anular`, { motivo });
  }

  sesionesPendientes(idPaciente: number) {
    return this.http.get(`${this.api}/pacientes/${idPaciente}/sesiones-pendientes`);
  }

  programarPaquete(id: number, data: any) {
    return this.http.post(`${this.api}/paquetes/${id}/programar`, data);
  }

  atencion(idCita: number) {
    return this.http.get(`${this.api}/citas/${idCita}`);
  }

  guardarAtencion(idCita: number, data: any) {
    return this.http.patch(`${this.api}/citas/${idCita}`, data);
  }

  programar(idCita: number, data: any) {
    return this.http.post(`${this.api}/citas/${idCita}/programar`, data);
  }

  finalizarAtencion(idCita: number, data: any) {
    return this.http.post(`${this.api}/citas/${idCita}/finalizar`, data);
  }

  restituir(idAtencion: number, motivo: string) {
    return this.http.post(`${this.api}/atenciones/${idAtencion}/restituir`, { motivo });
  }

  finanzasUnidad() {
    return this.http.get(`${this.unidadesApi}/activa/finanzas`);
  }

  guardarFinanzasUnidad(data: { requiere_comprobante: boolean }) {
    return this.http.patch(`${this.unidadesApi}/activa/finanzas`, data);
  }
}
