import { Component, OnInit, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { UnidadContextService } from 'src/app/core/services/unidad-context.service';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { MapaCorporalComponent } from '../mapa-corporal/mapa-corporal.component';
import { HistoriaDigitalService } from './historia-digital.service';

@Component({
  selector: 'app-atencion-cita',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, NgSelectModule, MapaCorporalComponent],
  templateUrl: './atencion-cita.component.html',
  styleUrls: ['./historia-digital.component.scss', './atencion-cita.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtencionCitaComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private unidad = inject(UnidadContextService);
  private api = inject(HistoriaDigitalService);
  private alert = inject(AlertService);
  perms = inject(PermissionsService);

  idCita = 0;
  loading = signal(true);
  guardando = signal(false);
  ficha = signal<any>(null);
  motivoRestitucion = signal('');
  itemSel = signal<number | null>(null);
  enEstaCita = signal(false);
  programando = signal(false);
  tab = signal('sesion');
  modalPago = signal(false);
  registrandoPago = signal(false);
  requiereComprobante = signal(false);

  readonly pestanas = [
    { id: 'sesion', label: 'Sesión', icon: 'bi-chat-left-text' },
    { id: 'evolucion', label: 'Evolución', icon: 'bi-activity' },
    { id: 'medidas', label: 'Medidas', icon: 'bi-rulers' },
    { id: 'mapa', label: 'Mapa', icon: 'bi-person-bounding-box' },
    { id: 'cierre', label: 'Cierre', icon: 'bi-check2-circle' },
  ];

  readonly duraciones = [
    { id: 30, nombre: '30 min' },
    { id: 45, nombre: '45 min' },
    { id: 60, nombre: '1 h' },
    { id: 90, nombre: '1 h 30 min' },
    { id: 120, nombre: '2 h' },
  ];

  readonly lados = [
    { id: 'DERECHO', nombre: 'Derecho' },
    { id: 'IZQUIERDO', nombre: 'Izquierdo' },
    { id: 'BILATERAL', nombre: 'Bilateral' },
    { id: 'CENTRAL', nombre: 'Central' },
  ];

  readonly medidas = [
    { id: 'peso', nombre: 'Peso' },
    { id: 'agua_corporal', nombre: 'Agua corporal' },
    { id: 'grasa_corporal', nombre: 'Grasa corporal' },
    { id: 'masa_muscular', nombre: 'Masa muscular' },
    { id: 'abdomen_alto', nombre: 'Abdomen alto' },
    { id: 'cintura', nombre: 'Cintura' },
    { id: 'ombligo', nombre: 'Ombligo' },
    { id: 'cadera', nombre: 'Cadera' },
  ];

  form = this.fb.group({
    id_item: [null as number | null],
    id_servicio: [null as number | null],
    id_hd_paquete: [null as number | null],
    id_hd_componente: [null as number | null],
    anamnesis: ['', Validators.required],
    zona: [''],
    lado: [null as string | null],
    tecnologias: [[] as number[]],
    parametros: [''],
    evolucion: [''],
    incidencias: [''],
    indicaciones: [''],
    proxima_revision: [''],
    medida_fecha: [''],
    peso: [null as number | null],
    agua_corporal: [null as number | null],
    grasa_corporal: [null as number | null],
    masa_muscular: [null as number | null],
    abdomen_alto: [null as number | null],
    cintura: [null as number | null],
    ombligo: [null as number | null],
    cadera: [null as number | null],
    medida_obs: [''],
  });

  formCita = this.fb.group({
    fecha: ['', Validators.required],
    hora_inicio: ['', Validators.required],
    id_personal: [null as number | null, Validators.required],
    duracion_minutos: [60, Validators.required],
  });

  formPago = this.fb.group({
    id_hd_paquete: [null as number | null, Validators.required],
    monto: [null as number | null, Validators.required],
    metodo_pago: ['EFECTIVO', Validators.required],
    tipo_pago: [null as string | null],
    comprobante_tipo: [''],
    comprobante_numero: [''],
    concepto: [''],
  });

  readonly metodosPago = [
    { id: 'EFECTIVO', nombre: 'Efectivo' },
    { id: 'TARJETA', nombre: 'Tarjeta' },
    { id: 'TRANSFERENCIA', nombre: 'Transferencia' },
    { id: 'YAPE', nombre: 'Yape' },
    { id: 'PLIN', nombre: 'Plin' },
    { id: 'OTRO', nombre: 'Otro' },
  ];

  readonly tiposPagoLabel: Record<string, string> = {
    ADELANTO: 'Adelanto — pago parcial antes de usar sesiones',
    ABONO: 'Abono — pago parcial cuando ya hubo al menos una sesión',
    CANCELACION: 'Liquidación — cobro del saldo restante (no anula el plan)',
  };

  componentes = computed(() => {
    const id = Number(this.itemSel() || 0);
    const item = (this.ficha()?.catalogo || []).find((i: any) => Number(i.id_item) === id);
    return item?.tipo === 'paquete' ? item.componentes || [] : [];
  });

  tecnologiasMapa = computed(() => {
    const lista = (this.ficha()?.tecnologias || []).map((t: any) => ({
      id: String(t.nombre),
      nombre: String(t.nombre),
    }));
    return lista.length ? lista : [{ id: 'Sesión', nombre: 'Sesión' }];
  });

  cerrada = computed(() => this.ficha()?.atencion?.estado === 'FINALIZADA');
  puedeRestituir = computed(() => {
    const movs = this.ficha()?.movimientos || [];
    return this.cerrada() && movs[0]?.tipo === 'DESCUENTO';
  });

  /** Aviso: el plan/ítem del formulario no coincide con el vínculo de la cita. */
  avisoPlanDistinto = computed(() => {
    const v = this.ficha()?.vinculo_cita;
    if (!v || this.cerrada()) return false;
    const formItem = Number(this.itemSel() || this.form.get('id_item')?.value || 0);
    const formPaq = Number(this.form.get('id_hd_paquete')?.value || 0);
    const vincItem = Number(v.id_item || 0);
    const vincPaq = Number(v.id_hd_paquete || 0);
    if (!formItem && !formPaq) return false;
    if (formItem && vincItem && formItem !== vincItem) return true;
    if (formPaq && vincPaq && formPaq !== vincPaq) return true;
    return false;
  });

  ngOnInit() {
    const codigo = this.unidad.membresias().find((m) => m.id_unidad === this.unidad.idUnidad())?.codigo;
    if (String(codigo || '').toUpperCase() !== 'SORELA') {
      this.router.navigateByUrl('/agenda');
      return;
    }
    const m = this.unidad.membresias().find((x) => x.id_unidad === this.unidad.idUnidad());
    if (m?.requiere_comprobante != null) {
      this.requiereComprobante.set(!!Number(m.requiere_comprobante));
    }
    this.route.paramMap.subscribe((p) => {
      this.idCita = Number(p.get('id') || 0);
      this.cargar();
    });
    this.form.get('id_item')?.valueChanges.subscribe((id) => {
      this.itemSel.set(id ? Number(id) : null);
      const ids = this.componentes().map((c: any) => Number(c.id_servicio));
      const actual = Number(this.form.get('id_servicio')?.value || 0);
      if (actual && !ids.includes(actual)) {
        this.form.patchValue({ id_servicio: null }, { emitEvent: false });
      }
    });
  }

  toggleRequiereComprobante(ev: Event) {
    if (!this.perms.hasPermission('administrar_configuracion_finanzas')) return;
    const checked = !!(ev.target as HTMLInputElement)?.checked;
    this.api.guardarFinanzasUnidad({ requiere_comprobante: checked }).subscribe({
      next: () => {
        this.requiereComprobante.set(checked);
        this.alert.success(checked ? 'Comprobante obligatorio al cobrar.' : 'Comprobante opcional.');
      },
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo guardar la configuración.'),
    });
  }

  cargar() {
    if (!this.idCita) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.atencion(this.idCita).subscribe({
      next: (res: any) => {
        const body = res?.data?.cita ? res.data : (res?.data?.data || res?.data || res);
        const a = body.atencion || {};
        if (body.cita?.estado === 'FINALIZADA' || a.estado === 'FINALIZADA') {
          this.loading.set(false);
          this.alert.warning('Esta cita ya está finalizada.');
          this.router.navigateByUrl('/agenda');
          return;
        }
        this.ficha.set(body);
        const m = a.medida || {};
        const vinc = body.vinculo_cita || null;
        const borradorPropio = !!(Number(a.id_hd_paquete) || Number(a.id_item));
        const idItemSel = borradorPropio
          ? a.id_item || null
          : a.id_item || vinc?.id_item || null;
        const idPaqueteSel = borradorPropio
          ? a.id_hd_paquete || null
          : a.id_hd_paquete || vinc?.id_hd_paquete || null;
        const comp = (body.paquetes || [])
          .flatMap((p: any) => p.componentes || [])
          .find((c: any) => Number(c.id_hd_componente) === Number(a.id_hd_componente));
        this.itemSel.set(idItemSel ? Number(idItemSel) : null);
        this.enEstaCita.set(
          (body.sesiones || []).some(
            (s: any) => Number(s.id_cita) === this.idCita && Number(s.id_item) === Number(idItemSel),
          ),
        );
        this.formCita.patchValue({
          id_personal: body.cita?.id_personal || this.formCita.value.id_personal,
        });
        this.form.patchValue({
          id_item: idItemSel,
          id_servicio: comp?.id_servicio || null,
          id_hd_paquete: idPaqueteSel,
          id_hd_componente: a.id_hd_componente || null,
          anamnesis: a.anamnesis || '',
          zona: a.zona || '',
          lado: a.lado || null,
          tecnologias: a.tecnologias || [],
          parametros: a.parametros || '',
          evolucion: a.evolucion || '',
          incidencias: a.incidencias || '',
          indicaciones: a.indicaciones || '',
          proxima_revision: a.proxima_revision || '',
          medida_fecha: m.fecha || body.cita?.fecha || '',
          peso: m.peso ?? null,
          agua_corporal: m.agua_corporal ?? null,
          grasa_corporal: m.grasa_corporal ?? null,
          masa_muscular: m.masa_muscular ?? null,
          abdomen_alto: m.abdomen_alto ?? null,
          cintura: m.cintura ?? null,
          ombligo: m.ombligo ?? null,
          cadera: m.cadera ?? null,
          medida_obs: m.observaciones || '',
        });
        if (a.estado === 'FINALIZADA') this.form.disable();
        else this.form.enable();
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.alert.error(err?.error?.mensaje || 'No se pudo abrir la atención.');
      },
    });
  }

  guardar() {
    this.enviar(false);
  }

  async finalizar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.alert.error('Escriba la anamnesis antes de finalizar.');
      return;
    }
    const consumir = this.debeConsumirSesion();
    if (this.itemEsPaquete() && consumir) {
      const ok = await this.alert.confirmAction(
        'Finalizar atención',
        'Se descontará 1 sesión del plan elegido. ¿Continuar?',
        'Finalizar',
      );
      if (!ok) return;
    } else if (this.itemEsPaquete() && !consumir) {
      const ok = await this.alert.confirmAction(
        'Finalizar sin descontar sesión',
        'No marcó que esta cita sea sesión del plan: se guardará la atención sin descontar. ¿Continuar?',
        'Finalizar',
      );
      if (!ok) return;
    }
    this.enviar(true);
  }

  /** Ítem de catálogo tipo paquete (tiene contador de sesiones). */
  itemEsPaquete(): boolean {
    const id = Number(this.itemSel() || 0);
    const item = (this.ficha()?.catalogo || []).find((i: any) => Number(i.id_item) === id);
    return String(item?.tipo || '') === 'paquete';
  }

  /** Descuenta solo si la cita ya está ligada o el usuario marcó el check. */
  debeConsumirSesion(): boolean {
    if (!this.itemEsPaquete()) return false;
    return this.estaCitaEsSesion() || this.enEstaCita();
  }

  paquetesCobrables(): any[] {
    return (this.ficha()?.paquetes || []).filter(
      (p: any) => Number(p.saldo || 0) > 0 && Number(p.exceso || 0) <= 0,
    );
  }

  paquetePagoSel() {
    const id = Number(this.formPago.get('id_hd_paquete')?.value || 0);
    return this.paquetesCobrables().find((p: any) => Number(p.id_hd_paquete) === id) || null;
  }

  opcionesTipoPagoModal(): { id: string; nombre: string }[] {
    const ops = this.paquetePagoSel()?.opciones_tipo_pago || [];
    return ops.map((id: string) => ({ id, nombre: this.tiposPagoLabel[id] || id }));
  }

  saldoPlanPago(): number {
    return Number(this.paquetePagoSel()?.saldo || 0);
  }

  cerrarModalPago(irAdmin = true) {
    this.modalPago.set(false);
    if (irAdmin) this.irAdministrativa();
  }

  registrarPagoModal() {
    if (this.formPago.invalid) {
      this.formPago.markAllAsTouched();
      return;
    }
    const paq = this.paquetePagoSel();
    const monto = Number(this.formPago.get('monto')?.value || 0);
    const saldo = Number(paq?.saldo || 0);
    if (!paq) {
      this.alert.error('Elija el plan a cobrar.');
      return;
    }
    if (Number(paq.exceso || 0) > 0) {
      this.alert.error('Este plan tiene exceso de pago. Ajuste o anule un cobro antes.');
      return;
    }
    if (!(monto > 0)) {
      this.alert.error('Indique un monto mayor que cero.');
      return;
    }
    if (monto > saldo + 1e-9) {
      this.alert.error(`El saldo del plan es S/ ${saldo.toFixed(2)}. No puede cobrar de más.`);
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
    const idPaciente = Number(this.ficha()?.paciente?.id_paciente || 0);
    if (!idPaciente) return;
    this.registrandoPago.set(true);
    this.api.pago(idPaciente, this.formPago.getRawValue()).subscribe({
      next: () => {
        this.registrandoPago.set(false);
        this.alert.success('Pago registrado');
        this.cerrarModalPago(true);
      },
      error: (err) => {
        this.registrandoPago.set(false);
        this.alert.error(err?.error?.mensaje || 'No se pudo registrar el pago.');
      },
    });
  }

  private irAdministrativa() {
    const idPaciente = Number(this.ficha()?.paciente?.id_paciente || 0);
    if (!idPaciente) {
      this.router.navigateByUrl('/agenda');
      return;
    }
    this.router.navigate(['/pacientes', idPaciente, 'historia-digital'], {
      queryParams: { tab: 'administrativa' },
    });
  }

  private async trasFinalizar() {
    const idPaciente = Number(this.ficha()?.paciente?.id_paciente || 0);
    const paquetes = this.paquetesCobrables();
    const quiere = await this.alert.confirmAction(
      '¿Registrar pago o adelanto?',
      'La atención quedó finalizada. ¿Desea registrar un cobro del tratamiento ahora?',
      'Sí, cobrar',
    );
    if (!quiere || !paquetes.length) {
      if (quiere && !paquetes.length) {
        this.alert.warning('No hay planes con saldo pendiente para cobrar.');
      }
      this.irAdministrativa();
      return;
    }
    const preferido =
      Number(this.form.get('id_hd_paquete')?.value || 0) ||
      Number(this.ficha()?.vinculo_cita?.id_hd_paquete || 0) ||
      Number(paquetes[0]?.id_hd_paquete || 0);
    const hit = paquetes.find((p: any) => Number(p.id_hd_paquete) === preferido) || paquetes[0];
    this.formPago.reset({
      id_hd_paquete: Number(hit.id_hd_paquete),
      monto: Number(hit.saldo) > 0 ? Number(hit.saldo) : null,
      metodo_pago: 'EFECTIVO',
      tipo_pago: null,
      comprobante_tipo: '',
      comprobante_numero: '',
      concepto: '',
    });
    this.modalPago.set(true);
  }

  restituir() {
    const motivo = this.motivoRestitucion().trim();
    const id = Number(this.ficha()?.atencion?.id_atencion || 0);
    if (!id || !motivo) {
      this.alert.error('Escriba el motivo de la restitución.');
      return;
    }
    this.guardando.set(true);
    this.api.restituir(id, motivo).subscribe({
      next: () => {
        this.motivoRestitucion.set('');
        this.guardando.set(false);
        this.alert.success('Sesión restituida. La atención queda como constancia.');
        this.cargar();
      },
      error: (err) => {
        this.guardando.set(false);
        this.alert.error(err?.error?.mensaje || 'No se pudo restituir la sesión.');
      },
    });
  }

  nombrePaciente(): string {
    const p = this.ficha()?.paciente;
    if (!p) return '';
    return `${p.apellidos || ''}, ${p.nombres || ''}`.replace(/^,\s*/, '');
  }

  iniciales(): string {
    const p = this.ficha()?.paciente;
    const a = String(p?.apellidos || '').trim().charAt(0);
    const n = String(p?.nombres || '').trim().charAt(0);
    return `${a}${n}`.toUpperCase() || 'P';
  }

  fechaCita(): string {
    const raw = String(this.ficha()?.cita?.fecha || '');
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : raw;
  }

  documentoPaciente(): string {
    const p = this.ficha()?.paciente;
    if (!p?.numero_documento) return '';
    return `${p.tipo_documento || 'DNI'} ${p.numero_documento}`;
  }

  etiquetaItem(item: any): string {
    if (!item) return '';
    const sesiones = item.sesiones ? `${item.sesiones} sesiones` : '1 sesión';
    const precio = item.sin_tarifa || item.precio == null ? '' : ` · S/ ${Number(item.precio).toFixed(2)}`;
    return `${item.nombre} · ${sesiones}${precio}`;
  }

  etiquetaPersonal(p: any): string {
    return `${p?.apellidos || ''}, ${p?.nombres || ''}`.replace(/^,\s*/, '');
  }

  sesionesDelItem(): any[] {
    const id = Number(this.itemSel() || 0);
    return (this.ficha()?.sesiones || []).filter((s: any) => Number(s.id_item) === id);
  }

  estaCitaEsSesion(): boolean {
    return this.sesionesDelItem().some((s) => Number(s.id_cita) === this.idCita);
  }

  etiquetaProgramar(): string {
    const nums = this.sesionesDelItem().map((s) => Number(s.numero_sesion));
    const max = nums.length ? Math.max(...nums) : 0;
    if (this.enEstaCita() || this.estaCitaEsSesion()) {
      const actual = this.sesionesDelItem().find((s) => Number(s.id_cita) === this.idCita);
      const n = Number(actual?.numero_sesion || 1) + 1;
      return n === 2 ? 'Programar segunda cita' : `Programar sesión ${n}`;
    }
    return max === 0 ? 'Programar primera sesión' : `Programar sesión ${max + 1}`;
  }

  programar() {
    const idItem = Number(this.form.getRawValue().id_item || 0);
    if (!idItem) {
      this.alert.error('Elija un servicio o paquete.');
      return;
    }
    if (this.formCita.invalid) {
      this.formCita.markAllAsTouched();
      return;
    }
    const cita = this.formCita.getRawValue();
    this.programando.set(true);
    this.api.programar(this.idCita, {
      id_item: idItem,
      en_esta_cita: this.enEstaCita() || this.estaCitaEsSesion(),
      fecha: cita.fecha,
      hora_inicio: cita.hora_inicio,
      id_personal: cita.id_personal,
      duracion_minutos: cita.duracion_minutos,
    }).subscribe({
      next: (res: any) => {
        const body = res?.data?.sesiones ? res.data : (res?.data?.data || res?.data || res);
        this.ficha.update((f) => (f ? { ...f, sesiones: body.sesiones || f.sesiones } : f));
        this.enEstaCita.set(this.estaCitaEsSesion());
        this.programando.set(false);
        this.alert.success(body.message || 'Cita programada');
      },
      error: (err) => {
        this.programando.set(false);
        this.alert.error(err?.error?.mensaje || 'No se pudo programar la cita.');
      },
    });
  }

  estadoLabel(): string {
    const estado = this.ficha()?.atencion?.estado;
    if (estado === 'FINALIZADA') return 'Finalizada';
    if (estado === 'BORRADOR') return 'Borrador';
    return 'Nueva';
  }

  private enviar(cierre: boolean) {
    this.guardando.set(true);
    const raw = this.form.getRawValue();
    const data = {
      id_item: raw.id_item,
      id_servicio: raw.id_servicio,
      id_hd_paquete: raw.id_hd_paquete,
      id_hd_componente: raw.id_hd_componente,
      consumir_sesion: cierre ? this.debeConsumirSesion() : undefined,
      anamnesis: raw.anamnesis,
      zona: raw.zona,
      lado: raw.lado,
      tecnologias: raw.tecnologias,
      parametros: raw.parametros,
      evolucion: raw.evolucion,
      incidencias: raw.incidencias,
      indicaciones: raw.indicaciones,
      proxima_revision: raw.proxima_revision,
      medida: {
        fecha: raw.medida_fecha,
        peso: raw.peso,
        agua_corporal: raw.agua_corporal,
        grasa_corporal: raw.grasa_corporal,
        masa_muscular: raw.masa_muscular,
        abdomen_alto: raw.abdomen_alto,
        cintura: raw.cintura,
        ombligo: raw.ombligo,
        cadera: raw.cadera,
        observaciones: raw.medida_obs,
      },
    };
    const req = cierre
      ? this.api.finalizarAtencion(this.idCita, data)
      : this.api.guardarAtencion(this.idCita, data);
    req.subscribe({
      next: async () => {
        this.guardando.set(false);
        this.alert.success(cierre ? 'Atención finalizada' : 'Borrador guardado');
        if (cierre) {
          const idPaciente = Number(this.ficha()?.paciente?.id_paciente || 0);
          if (!idPaciente) {
            void this.trasFinalizar();
            return;
          }
          // Refrescar planes/saldos (el plan pudo crearse al finalizar).
          this.api.ficha(idPaciente).subscribe({
            next: (res: any) => {
              const body = res?.data?.paciente ? res.data : (res?.data?.data || res?.data || res);
              if (body?.paquetes) {
                this.ficha.update((f) => (f ? { ...f, paquetes: body.paquetes } : f));
              }
              void this.trasFinalizar();
            },
            error: () => void this.trasFinalizar(),
          });
          return;
        }
        this.cargar();
      },
      error: (err) => {
        this.guardando.set(false);
        this.alert.error(err?.error?.mensaje || 'No se pudo guardar la atención.');
      },
    });
  }
}
