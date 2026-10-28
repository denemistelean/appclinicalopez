import { Component, OnInit, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { NgSelectModule } from '@ng-select/ng-select';
import { UnidadContextService } from 'src/app/core/services/unidad-context.service';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { DocumentosService } from '../documentos/documentos.service';
import { HistoriaDigitalService } from './historia-digital.service';

@Component({
  selector: 'app-historia-digital',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, NgSelectModule],
  templateUrl: './historia-digital.component.html',
  styleUrl: './historia-digital.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoriaDigitalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private unidad = inject(UnidadContextService);
  private api = inject(HistoriaDigitalService);
  private documentos = inject(DocumentosService);
  private alert = inject(AlertService);
  perms = inject(PermissionsService);

  idPaciente = 0;
  loading = signal(true);
  guardando = signal(false);
  programarId = signal<number | null>(null);
  programando = signal(false);
  tab = signal('procedencia');
  ficha = signal<any>(null);
  filtroDoc = signal('TODOS');
  archivo: File | null = null;
  requiereComprobante = signal(false);
  sesionesPorProgramar = signal<any[]>([]);
  citaSel = signal<any>(null);
  detalleAtencion = signal<any>(null);
  loadingDetalle = signal(false);
  planSelId = signal<number | null>(null);
  readonly tiposPagoLabel: Record<string, string> = {
    ADELANTO: 'Adelanto — pago parcial antes de usar sesiones',
    ABONO: 'Abono — pago parcial cuando ya hubo al menos una sesión',
    CANCELACION: 'Liquidación — cobro del saldo restante (no anula el plan)',
  };

  readonly pestanas = [
    { id: 'procedencia', label: 'Procedencia' },
    { id: 'antecedentes', label: 'Antecedentes' },
    { id: 'evaluacion', label: 'Evaluación' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'atenciones', label: 'Atenciones' },
    { id: 'administrativa', label: 'Administrativa' },
    { id: 'cirugias', label: 'Cirugías' },
  ];

  readonly procedencias = [
    { id: 'INSTAGRAM', nombre: 'Instagram' },
    { id: 'FACEBOOK', nombre: 'Facebook' },
    { id: 'GOOGLE', nombre: 'Google' },
    { id: 'WHATSAPP', nombre: 'WhatsApp' },
    { id: 'REFERIDO_CLINICA', nombre: 'Referido de clínica' },
    { id: 'REFERIDO_PACIENTE', nombre: 'Referido de pacientes' },
    { id: 'OTRO', nombre: 'Otro' },
  ];

  readonly siNo = [
    { id: 1, nombre: 'Sí' },
    { id: 0, nombre: 'No' },
  ];

  readonly duraciones = [
    { id: 30, nombre: '30 min' },
    { id: 45, nombre: '45 min' },
    { id: 60, nombre: '1 h' },
    { id: 90, nombre: '1 h 30' },
    { id: 120, nombre: '2 h' },
  ];

  readonly metodos = [
    { id: 'EFECTIVO', nombre: 'Efectivo' },
    { id: 'TARJETA', nombre: 'Tarjeta' },
    { id: 'TRANSFERENCIA', nombre: 'Transferencia' },
    { id: 'YAPE', nombre: 'Yape' },
    { id: 'PLIN', nombre: 'Plin' },
    { id: 'OTRO', nombre: 'Otro' },
  ];

  readonly filtrosDocumento = [
    { id: 'TODOS', nombre: 'Todos' },
    { id: 'CONSENTIMIENTOS', nombre: 'Consentimientos' },
    { id: 'DOCUMENTOS', nombre: 'Indicaciones e historias' },
    { id: 'FOTOS', nombre: 'Fotografías' },
    { id: 'OTROS', nombre: 'Otros' },
  ];

  form = this.fb.group({
    tipo_documento: ['DNI'],
    numero_documento: ['', Validators.required],
    nombres: ['', Validators.required],
    apellidos: ['', Validators.required],
    fecha_nacimiento: [''],
    ocupacion: [''],
    telefono: [''],
    telefono_alterno: [''],
    email: [''],
    direccion: [''],
    contacto_emergencia_nombre: [''],
    contacto_emergencia_parentesco: [''],
    contacto_emergencia_telefono: [''],
    procedencia: [null as string | null],
    detalle_referido: [''],
    campana: [''],
    enfermedades: [''],
    alergias: [''],
    medicamentos_actuales: [''],
    tratamientos_previos: [''],
    hipertension: [null as number | null],
    diabetes: [null as number | null],
    anticonceptivos: [null as number | null],
    tabaquismo: [null as number | null],
    observaciones_antecedentes: [''],
  });

  formEval = this.fb.group({
    fecha: ['', Validators.required],
    motivo: [''],
    objetivos: [''],
    zonas: [''],
    hallazgos: [''],
    plan_tratamiento: [''],
  });

  formCirugia = this.fb.group({
    fecha: ['', Validators.required],
    id_personal: [null as number | null],
    zonas: [''],
    indicaciones: [''],
  });

  formPaquete = this.fb.group({
    id_item: [null as number | null, Validators.required],
    sesiones_total: [null as number | null, Validators.required],
    precio_acordado: [null as number | null, Validators.required],
  });

  formPago = this.fb.group({
    id_hd_paquete: [null as number | null, Validators.required],
    moneda: ['PEN', Validators.required],
    monto: [null as number | null, Validators.required],
    monto_moneda: [null as number | null],
    tipo_cambio: [null as number | null],
    metodo_pago: ['EFECTIVO', Validators.required],
    tipo_pago: [null as string | null],
    comprobante_tipo: [''],
    comprobante_numero: [''],
    concepto: [''],
  });

  readonly monedas = [
    { id: 'PEN', nombre: 'Soles (PEN)' },
    { id: 'USD', nombre: 'Dólares (USD)' },
  ];

  formCita = this.fb.group({
    fecha: ['', Validators.required],
    hora_inicio: ['', Validators.required],
    id_personal: [null as number | null, Validators.required],
    duracion_minutos: [60, Validators.required],
  });

  formDoc = this.fb.group({
    id_tipo_documento: [null as number | null, Validators.required],
    titulo: [''],
  });

  ngOnInit() {
    const codigo = this.unidad.membresias().find((m) => m.id_unidad === this.unidad.idUnidad())?.codigo;
    if (String(codigo || '').toUpperCase() !== 'SORELA') {
      this.router.navigateByUrl('/pacientes');
      return;
    }
    this.route.paramMap.subscribe((p) => {
      this.idPaciente = Number(p.get('id') || 0);
      this.cargar();
    });
    this.route.queryParamMap.subscribe((q) => {
      let t = String(q.get('tab') || '').trim();
      if (t === 'historial') t = 'atenciones';
      if (t && this.pestanas.some((p) => p.id === t)) this.tab.set(t);
    });
  }

  cargar() {
    if (!this.idPaciente) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.ficha(this.idPaciente).subscribe({
      next: (res: any) => {
        const body = res?.data?.paciente ? res.data : (res?.data?.data || res?.data || res);
        this.ficha.set(body);
        const selId = Number(this.citaSel()?.id_cita || 0);
        if (selId) {
          const keep = (body.citas || []).find((c: any) => Number(c.id_cita) === selId);
          this.citaSel.set(keep || null);
          if (!keep) this.detalleAtencion.set(null);
        } else {
          this.citaSel.set(null);
          this.detalleAtencion.set(null);
        }
        const p = body.paciente || {};
        const h = body.historia || {};
        this.form.patchValue({
          ...p,
          ...h,
          hipertension: this.flag(h.hipertension),
          diabetes: this.flag(h.diabetes),
          anticonceptivos: this.flag(h.anticonceptivos),
          tabaquismo: this.flag(h.tabaquismo),
        });
        this.loading.set(false);
        this.cargarSesionesPorProgramar();
        this.cargarFinanzas();
      },
      error: (err) => {
        this.loading.set(false);
        this.alert.error(err?.error?.mensaje || 'No se pudo abrir la historia digital.');
      },
    });
  }

  cargarSesionesPorProgramar() {
    if (!this.idPaciente) {
      this.sesionesPorProgramar.set([]);
      return;
    }
    this.api.sesionesPendientes(this.idPaciente).subscribe({
      next: (res: any) => {
        const body = res?.data?.planes ? res.data : res?.data?.data || res?.data || res;
        this.sesionesPorProgramar.set(Array.isArray(body?.planes) ? body.planes : []);
      },
      error: () => this.sesionesPorProgramar.set([]),
    });
  }

  cargarFinanzas() {
    const m = this.unidad.membresias().find((x) => x.id_unidad === this.unidad.idUnidad());
    if (m?.requiere_comprobante != null) {
      this.requiereComprobante.set(!!Number(m.requiere_comprobante));
    }
    if (!this.perms.hasPermission('administrar_configuracion_finanzas')) return;
    this.api.finanzasUnidad().subscribe({
      next: (res: any) => {
        const body = res?.data?.id_unidad != null ? res.data : res?.data?.data || res?.data || res;
        this.requiereComprobante.set(!!body?.requiere_comprobante);
      },
      error: () => undefined,
    });
  }

  puedeRestituirMovimiento(p: any, m: any): boolean {
    if (String(p?.estado_plan || '') !== 'VIGENTE') return false;
    if (!this.perms.hasPermission('restituir_sesion') || m?.tipo !== 'DESCUENTO' || !m?.id_atencion) {
      return false;
    }
    const movs = p?.movimientos || [];
    return !movs.some(
      (r: any) => r.tipo === 'RESTITUCION' && Number(r.id_atencion) === Number(m.id_atencion),
    );
  }

  planesVigentes(): any[] {
    return (this.ficha()?.paquetes || []).filter((p: any) => String(p.estado_plan) === 'VIGENTE');
  }

  planesHistorial(): any[] {
    return (this.ficha()?.paquetes || []).filter((p: any) =>
      ['BAJA', 'COMPLETADO'].includes(String(p.estado_plan || '')),
    );
  }

  togglePlan(p: any) {
    const id = Number(p?.id_hd_paquete || 0);
    if (!id) return;
    if (this.planSelId() === id) {
      this.planSelId.set(null);
      this.formPago.patchValue({ id_hd_paquete: null });
      return;
    }
    this.planSelId.set(id);
    this.formPago.patchValue({
      id_hd_paquete: id,
      tipo_pago: null,
      monto: null,
      concepto: '',
      comprobante_tipo: '',
      comprobante_numero: '',
      metodo_pago: 'EFECTIVO',
    });
  }

  etiquetaEstadoPlan(p: any): string {
    const e = String(p?.estado_plan || '');
    if (e === 'VIGENTE') return 'Vigente';
    if (e === 'COMPLETADO') return 'Completado';
    if (e === 'BAJA') return 'Dado de baja';
    return e || '—';
  }

  pagosDePlan(p: any): any[] {
    if (Array.isArray(p?.pagos)) return p.pagos;
    const id = Number(p?.id_hd_paquete || 0);
    return (this.ficha()?.pagos || []).filter((x: any) => Number(x.id_hd_paquete) === id);
  }

  /** Plan activo (vigente o completado): se puede cobrar / ajustar. Baja: solo lectura. */
  puedeCobrarPlan(p: any): boolean {
    return String(p?.estado_registro || '') === 'ACTIVO' && String(p?.estado_plan || '') !== 'BAJA';
  }

  toggleRequiereComprobante(ev: Event) {
    const checked = !!(ev.target as HTMLInputElement)?.checked;
    this.api.guardarFinanzasUnidad({ requiere_comprobante: checked }).subscribe({
      next: () => {
        this.requiereComprobante.set(checked);
        this.alert.success(checked ? 'Comprobante obligatorio al cobrar.' : 'Comprobante opcional.');
      },
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo guardar la configuración.'),
    });
  }

  irAgendarPlan(p: any) {
    this.router.navigate(['/agenda'], {
      queryParams: { id_paciente: this.idPaciente, id_hd_paquete: p.id_hd_paquete },
    });
  }

  guardar() {
    if (!this.perms.hasPermission('actualizar_paciente')) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.alert.warning('Complete documento, nombres y apellidos.');
      return;
    }
    this.guardando.set(true);
    this.api.guardar(this.idPaciente, this.form.getRawValue()).subscribe({
      next: () => {
        this.guardando.set(false);
        this.alert.success('Historia digital guardada');
        this.cargar();
      },
      error: (err) => {
        this.guardando.set(false);
        this.alert.error(err?.error?.mensaje || 'No se pudo guardar.');
      },
    });
  }

  seleccionarCita(c: any) {
    this.citaSel.set(c);
    this.detalleAtencion.set(null);
    const idCita = Number(c?.id_cita || 0);
    if (!idCita) return;
    this.loadingDetalle.set(true);
    this.api.atencion(idCita).subscribe({
      next: (res: any) => {
        const body = res?.data?.cita ? res.data : (res?.data?.data || res?.data || res);
        this.detalleAtencion.set(body);
        this.loadingDetalle.set(false);
      },
      error: () => {
        this.loadingDetalle.set(false);
        this.alert.warning('Sin registro de atención para esta cita');
      },
    });
  }

  tituloCita(c: any): string {
    return c?.tipo_cita || c?.notas || 'Cita';
  }

  fechaCitaCorta(c: any): string {
    const raw = c?.fecha;
    if (!raw) return '';
    const d = new Date(typeof raw === 'string' && raw.length <= 10 ? raw + 'T12:00:00' : raw);
    if (isNaN(d.getTime())) return String(raw).slice(0, 10);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  }

  horaCita(c: any): string {
    const h = String(c?.hora || '').slice(0, 5);
    if (!h) return '';
    const [hh, mm] = h.split(':').map(Number);
    const ampm = hh >= 12 ? 'p.m.' : 'a.m.';
    const h12 = ((hh + 11) % 12) + 1;
    return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
  }

  estadoAtencionLabel(c: any): string {
    const e = String(c?.atencion_estado || this.detalleAtencion()?.atencion?.estado || '').toUpperCase();
    if (e === 'FINALIZADA') return 'Completada';
    if (e === 'BORRADOR') return 'En curso';
    if (!c?.id_atencion && !this.detalleAtencion()?.atencion) return 'Sin atención';
    return e || '—';
  }

  puedeAtender(c: any): boolean {
    if (!c) return false;
    const estCita = String(c.estado || '').toUpperCase();
    if (['FINALIZADA', 'CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA'].includes(estCita)) return false;
    const estAten = String(c.atencion_estado || this.detalleAtencion()?.atencion?.estado || '').toUpperCase();
    return estAten !== 'FINALIZADA';
  }

  irAtender(c: any) {
    if (!c?.id_cita || !this.puedeAtender(c)) {
      this.alert.warning('Esta cita no se puede atender.');
      return;
    }
    this.router.navigate(['/citas', c.id_cita, 'atencion']);
  }

  nombresTecnologias(det: any): string[] {
    const ids: number[] = det?.atencion?.tecnologias || [];
    const cat: any[] = det?.tecnologias || [];
    return ids
      .map((id) => cat.find((t) => Number(t.id_tecnologia) === Number(id))?.nombre)
      .filter(Boolean);
  }

  nombreItemAtencion(det: any): string {
    const id = Number(det?.atencion?.id_item || det?.vinculo_cita?.id_item || 0);
    if (!id) return '';
    const item = (det?.catalogo || []).find((x: any) => Number(x.id_item) === id);
    return item ? `${item.codigo || ''} ${item.nombre || ''}`.trim() : '';
  }

  agregarEvaluacion() {
    if (this.formEval.invalid) {
      this.formEval.markAllAsTouched();
      return;
    }
    this.api.evaluacion(this.idPaciente, this.formEval.getRawValue()).subscribe({
      next: () => {
        this.formEval.reset();
        this.alert.success('Evaluación registrada');
        this.cargar();
      },
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo registrar.'),
    });
  }

  quitarEvaluacion(id: number) {
    this.api.quitarEvaluacion(id).subscribe({
      next: () => this.cargar(),
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo quitar.'),
    });
  }

  agregarCirugia() {
    if (this.formCirugia.invalid) {
      this.formCirugia.markAllAsTouched();
      return;
    }
    this.api.cirugia(this.idPaciente, this.formCirugia.getRawValue()).subscribe({
      next: () => {
        this.formCirugia.reset();
        this.alert.success('Cirugía registrada');
        this.cargar();
      },
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo registrar.'),
    });
  }

  quitarCirugia(id: number) {
    this.api.quitarCirugia(id).subscribe({
      next: () => this.cargar(),
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo quitar.'),
    });
  }

  alElegirPaquete(id: any) {
    const idItem = Number(id?.id_item ?? id);
    const item = (this.ficha()?.catalogo || []).find((x: any) => Number(x.id_item) === idItem);
    if (!item) return;
    this.formPaquete.patchValue({ sesiones_total: item.sesiones || null });
  }

  agregarPaquete() {
    if (this.formPaquete.invalid) {
      this.formPaquete.markAllAsTouched();
      return;
    }
    this.api.paquete(this.idPaciente, this.formPaquete.getRawValue()).subscribe({
      next: () => {
        this.formPaquete.reset();
        this.alert.success('Paquete asignado');
        this.cargar();
      },
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo asignar.'),
    });
  }

  agregarPago() {
    const moneda = String(this.formPago.get('moneda')?.value || 'PEN').toUpperCase();
    if (moneda === 'USD') {
      const usd = Number(this.formPago.get('monto_moneda')?.value || 0);
      const tc = Number(this.formPago.get('tipo_cambio')?.value || 0);
      if (!(usd > 0) || !(tc > 0)) {
        this.alert.warning('Indique monto en USD y tipo de cambio del día.');
        return;
      }
      this.formPago.patchValue({ monto: Number((usd * tc).toFixed(2)) });
    }
    if (this.formPago.invalid) {
      this.formPago.markAllAsTouched();
      return;
    }
    const paquete = this.paqueteSeleccionado();
    if (paquete && Number(paquete.exceso || 0) > 0) {
      this.alert.error('Este plan tiene exceso de pago. Ajuste o anule un pago antes de cobrar.');
      return;
    }
    const monto = Number(this.formPago.get('monto')?.value || 0);
    if (paquete && monto > Number(paquete.saldo || 0)) {
      this.alert.error(`El saldo de ${paquete.nombre} es ${Number(paquete.saldo).toFixed(2)} (PEN).`);
      return;
    }
    if (this.requiereComprobante()) {
      const tipo = String(this.formPago.get('comprobante_tipo')?.value || '').trim();
      const num = String(this.formPago.get('comprobante_numero')?.value || '').trim();
      if (!tipo || !num) {
        this.alert.warning('Esta unidad exige tipo y número de comprobante.');
        return;
      }
    }
    const idPlan = Number(this.formPago.get('id_hd_paquete')?.value || this.planSelId() || 0);
    this.api.pago(this.idPaciente, this.formPago.getRawValue()).subscribe({
      next: () => {
        this.formPago.reset({
          metodo_pago: 'EFECTIVO',
          tipo_pago: null,
          moneda: 'PEN',
          id_hd_paquete: idPlan || null,
        });
        this.alert.success('Pago registrado');
        this.cargar();
      },
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo registrar el pago.'),
    });
  }

  paqueteSeleccionado() {
    const id = Number(this.formPago.get('id_hd_paquete')?.value || this.planSelId() || 0);
    return (this.ficha()?.paquetes || []).find((p: any) => Number(p.id_hd_paquete) === id) || null;
  }

  opcionesTipoPagoActual(): { id: string; nombre: string }[] {
    const ops = this.paqueteSeleccionado()?.opciones_tipo_pago || [];
    return ops.map((id: string) => ({ id, nombre: this.tiposPagoLabel[id] || id }));
  }

  /** Pagos legados (tipo_pago NULL): no inventar clasificación; mostrar genérico. */
  etiquetaTipoPago(tipo: string | null | undefined): string {
    const t = String(tipo || '').trim().toUpperCase();
    if (t === 'ADELANTO') return 'Adelanto';
    if (t === 'ABONO') return 'Abono';
    if (t === 'CANCELACION') return 'Liquidación de saldo';
    if (t === 'DEVOLUCION') return 'Devolución';
    return 'Pago';
  }

  etiquetaPago(p: any): string {
    const exceso = Number(p?.exceso || 0);
    if (exceso > 0) return `${p.nombre} · exceso ${exceso.toFixed(2)}`;
    const saldo = Number(p?.saldo || 0);
    return saldo > 0 ? `${p.nombre} · saldo ${saldo.toFixed(2)}` : `${p.nombre} · pagado`;
  }

  async ajustarPago(p: any) {
    if (!this.perms.hasPermission('ajustar_pago')) return;
    const Swal = (await import('sweetalert2')).default;
    const montoRes = await Swal.fire({
      title: 'Ajustar pago',
      input: 'number',
      inputLabel: 'Nuevo monto (no puede hacer que la suma supere el precio del plan)',
      inputValue: Number(p.monto),
      showCancelButton: true,
      confirmButtonText: 'Continuar',
    });
    if (!montoRes.isConfirmed || montoRes.value == null || montoRes.value === '') return;
    const motivoRes = await Swal.fire({
      title: 'Motivo del ajuste',
      input: 'text',
      inputPlaceholder: 'Obligatorio',
      showCancelButton: true,
      confirmButtonText: 'Guardar',
    });
    if (!motivoRes.isConfirmed || !String(motivoRes.value || '').trim()) {
      this.alert.warning('Indique el motivo del ajuste.');
      return;
    }
    this.api
      .ajustarPago(p.id_pago, { monto: Number(montoRes.value), motivo: String(motivoRes.value).trim() })
      .subscribe({
        next: () => {
          this.alert.success('Pago ajustado');
          this.cargar();
        },
        error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo ajustar el pago.'),
      });
  }

  async bajarPlan(p: any) {
    if (!this.perms.hasPermission('actualizar_paciente') || !p?.id_hd_paquete) return;
    const pagado = Number(p.pagado || 0);
    const ok = await this.alert.confirmAction(
      'Dar de baja el plan',
      `Se dará de baja «${p.nombre}». Si hay pagos, deberá indicar cuánto se devuelve y cuánto queda como pago.`,
      'Continuar',
    );
    if (!ok) return;
    const Swal = (await import('sweetalert2')).default;
    const motivoRes = await Swal.fire({
      title: 'Motivo de la baja',
      input: 'text',
      inputPlaceholder: 'Obligatorio',
      showCancelButton: true,
      confirmButtonText: pagado > 0 ? 'Siguiente' : 'Dar de baja',
      customClass: {
        popup: 'swal2-popup',
        confirmButton: 'btn btn-danger',
        cancelButton: 'btn btn-soft-neutral',
      },
      buttonsStyling: false,
    });
    if (!motivoRes.isConfirmed || !String(motivoRes.value || '').trim()) {
      this.alert.warning('Indique el motivo de la baja.');
      return;
    }
    let monto_devolucion = 0;
    let monto_retenido = pagado;
    if (pagado > 0) {
      const devRes = await Swal.fire({
        title: 'Devolución de dinero',
        html: `<p class="small text-start mb-2">Pagado neto: <b>S/ ${pagado.toFixed(2)}</b>. Indique cuánto se devuelve; el resto queda como pago retenido.</p>`,
        input: 'number',
        inputValue: pagado,
        inputLabel: 'Monto a devolver (S/)',
        showCancelButton: true,
        confirmButtonText: 'Dar de baja',
        customClass: {
          popup: 'swal2-popup',
          confirmButton: 'btn btn-danger',
          cancelButton: 'btn btn-soft-neutral',
        },
        buttonsStyling: false,
      });
      if (!devRes.isConfirmed) return;
      monto_devolucion = Number(devRes.value);
      if (!Number.isFinite(monto_devolucion) || monto_devolucion < 0 || monto_devolucion > pagado) {
        this.alert.warning(`La devolución debe estar entre 0 y ${pagado.toFixed(2)}.`);
        return;
      }
      monto_retenido = Math.round((pagado - monto_devolucion) * 100) / 100;
    }
    this.api
      .bajarPlan(Number(p.id_hd_paquete), {
        motivo: String(motivoRes.value).trim(),
        monto_devolucion,
        monto_retenido,
      })
      .subscribe({
        next: (res: any) => {
          const body = res?.data?.message ? res.data : res?.data?.data || res?.data || res;
          this.alert.success(body?.message || 'Plan dado de baja');
          this.cargar();
        },
        error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo dar de baja el plan.'),
      });
  }

  async anularPago(p: any) {
    if (!this.perms.hasPermission('ajustar_pago')) return;
    const ok = await this.alert.confirmAction(
      'Anular pago',
      `Se anulará el pago de ${Number(p.monto).toFixed(2)}. ¿Continuar?`,
      'Anular',
    );
    if (!ok) return;
    const Swal = (await import('sweetalert2')).default;
    const motivoRes = await Swal.fire({
      title: 'Motivo de la anulación',
      input: 'text',
      inputPlaceholder: 'Obligatorio',
      showCancelButton: true,
      confirmButtonText: 'Anular',
    });
    if (!motivoRes.isConfirmed || !String(motivoRes.value || '').trim()) {
      this.alert.warning('Indique el motivo de la anulación.');
      return;
    }
    this.api.anularPago(p.id_pago, String(motivoRes.value).trim()).subscribe({
      next: () => {
        this.alert.success('Pago anulado');
        this.cargar();
      },
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo anular el pago.'),
    });
  }

  async restituirMovimiento(m: any) {
    if (!this.perms.hasPermission('restituir_sesion') || !m?.id_atencion || m.tipo !== 'DESCUENTO') return;
    const ok = await this.alert.confirmAction(
      'Restituir sesión',
      'Úselo si la sesión se descontó por error (p. ej. se finalizó la atención equivocada). Devuelve 1 sesión al plan; la atención clínica permanece cerrada. Solo la última sesión consumida del plan se puede restituir (luego la anterior, en cadena).',
      'Restituir',
    );
    if (!ok) return;
    const Swal = (await import('sweetalert2')).default;
    const motivoRes = await Swal.fire({
      title: 'Motivo de la restitución',
      input: 'text',
      inputPlaceholder: 'Obligatorio',
      showCancelButton: true,
      confirmButtonText: 'Restituir',
    });
    if (!motivoRes.isConfirmed || !String(motivoRes.value || '').trim()) {
      this.alert.warning('Indique el motivo.');
      return;
    }
    this.api.restituir(m.id_atencion, String(motivoRes.value).trim()).subscribe({
      next: (res: any) => {
        const body = res?.data?.message ? res.data : res?.data?.data || res?.data || res;
        this.alert.success(body?.message || 'Sesión restituida');
        this.cargar();
      },
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo restituir.'),
    });
  }

  abrirProgramar(p: any) {
    const id = Number(p?.id_hd_paquete);
    this.programarId.set(this.programarId() === id ? null : id);
  }

  programarSiguiente(p: any) {
    if (this.formCita.invalid) {
      this.formCita.markAllAsTouched();
      this.alert.warning('Indique fecha, hora y cosmiatra.');
      return;
    }
    this.programando.set(true);
    this.api.programarPaquete(p.id_hd_paquete, this.formCita.getRawValue()).subscribe({
      next: (res: any) => {
        const body = res?.data?.message ? res.data : (res?.data?.data || res?.data || res);
        this.programando.set(false);
        this.programarId.set(null);
        this.formCita.reset({ duracion_minutos: 60 });
        this.alert.success(body?.message || 'Cita programada');
        this.cargar();
      },
      error: (err) => {
        this.programando.set(false);
        this.alert.error(err?.error?.mensaje || 'No se pudo programar la cita.');
      },
    });
  }

  elegirArchivo(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.archivo = input.files?.[0] || null;
  }

  subirDocumento() {
    if (!this.perms.hasPermission('crear_documento')) {
      this.alert.warning('No tiene permiso para subir documentos.');
      return;
    }
    if (this.formDoc.invalid || !this.archivo) {
      this.formDoc.markAllAsTouched();
      this.alert.warning('Elija el tipo y el archivo.');
      return;
    }
    const fd = new FormData();
    fd.append('archivo', this.archivo);
    fd.append('id_paciente', String(this.idPaciente));
    fd.append('id_tipo_documento', String(this.formDoc.get('id_tipo_documento')?.value));
    const titulo = this.formDoc.get('titulo')?.value;
    if (titulo) fd.append('titulo', titulo);
    this.documentos.upload(fd).subscribe({
      next: () => {
        this.archivo = null;
        this.formDoc.reset();
        this.alert.success('Documento guardado');
        this.cargar();
      },
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo subir el archivo.'),
    });
  }

  async verArchivo(item: any) {
    try {
      const blob = await this.http.get(this.documentos.archivoUrl(item.id_documento), { responseType: 'blob' }).toPromise();
      if (!blob) return;
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      this.alert.error('No se pudo abrir el archivo.');
    }
  }

  documentosVisibles() {
    const lista = this.ficha()?.documentos || [];
    const filtro = this.filtroDoc();
    if (filtro === 'TODOS') return lista;
    return lista.filter((d: any) => d.tipo === filtro);
  }

  fotos() {
    return (this.ficha()?.documentos || []).filter((d: any) => d.tipo === 'FOTOS');
  }

  nombrePaciente(): string {
    const p = this.ficha()?.paciente;
    if (!p) return '';
    return `${p.apellidos || ''}, ${p.nombres || ''}`.replace(/^,\s*/, '');
  }

  etiquetaPersonal(item: any): string {
    return `${item?.apellidos || ''}, ${item?.nombres || ''}`.replace(/^,\s*/, '');
  }

  etiquetaPaquete(item: any): string {
    return `${item?.codigo || ''} ${item?.nombre || ''}`.trim();
  }

  pendientes(p: any): number {
    if (Array.isArray(p?.componentes) && p.componentes.length) {
      return p.componentes.reduce(
        (s: number, c: any) => s + Math.max(0, Number(c.sesiones_total) - Number(c.sesiones_usadas)),
        0,
      );
    }
    return Math.max(0, Number(p?.sesiones_total || 0) - Number(p?.sesiones_usadas || 0));
  }

  /** Próxima sesión del plan (1-based): tras 1 usada → 2. */
  siguienteSesion(p: any): number {
    return Math.min(Number(p?.sesiones_total) || 0, Number(p?.sesiones_usadas || 0) + 1) || 1;
  }

  siguienteComponente(c: any): number {
    return Math.min(Number(c?.sesiones_total) || 0, Number(c?.sesiones_usadas || 0) + 1) || 1;
  }

  private flag(v: any): number | null {
    if (v === 1 || v === '1' || v === true) return 1;
    if (v === 0 || v === '0' || v === false) return 0;
    return null;
  }
}
