import {
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormControl } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';

import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { SedeContextService } from 'src/app/core/services/sede-context.service';
import { SedesService } from '../sedes/sedes.service';
import { PersonalService } from '../personal/personal.service';
import { PacientesService } from '../pacientes/pacientes.service';
import { TratamientosService } from '../tratamientos/tratamientos.service';
import { AgendaService } from './agenda.service';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormErrorComponent, NgSelectModule, NgbModalModule],
  templateUrl: './agenda.component.html',
  styleUrls: ['./agenda.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(AgendaService);
  private sedesService = inject(SedesService);
  private personalService = inject(PersonalService);
  private pacientesService = inject(PacientesService);
  private tratamientosService = inject(TratamientosService);
  private sedeCtx = inject(SedeContextService);
  private alert = inject(AlertService);
  private modal = inject(NgbModal);
  public perms = inject(PermissionsService);

  form: FormGroup;
  fechaDia = new FormControl(new Date().toISOString().slice(0, 10), { nonNullable: true });

  dayData = signal<any>(null);
  loading = signal(false);
  validacion = signal<any>(null);
  sugerencia = signal<string | null>(null);
  waitlist = signal<any[]>([]);
  paquetes = signal<any[]>([]);
  citaDetalle = signal<any>(null);

  sedes = signal<any[]>([]);
  personal = signal<any[]>([]);
  pacientes = signal<any[]>([]);
  tratamientos = signal<any[]>([]);
  tiposCita = signal<any[]>([]);
  tipoSel = signal<any>(null);
  salas = signal<any[]>([]);
  equipos = signal<any[]>([]);

  horas = Array.from({ length: 11 }, (_, i) => 9 + i);
  dayStartMin = 9 * 60;
  dayEndMin = 19 * 60;

  /** Slots estables para ng-select (evitar regenerar array de strings en cada CD) */
  readonly horasSlots: { id: string; nombre: string }[] = (() => {
    const out: { id: string; nombre: string }[] = [];
    for (let m = this.dayStartMin; m < this.dayEndMin; m += 15) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      const v = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      out.push({ id: v, nombre: v });
    }
    return out;
  })();

  muestraTratamiento = computed(() => !!Number(this.tipoSel()?.requiere_tratamiento));
  muestraSala = computed(
    () => !!Number(this.tipoSel()?.requiere_sala) || this.muestraTratamiento(),
  );
  muestraEquipo = computed(
    () => !!Number(this.tipoSel()?.requiere_equipo) || this.muestraTratamiento(),
  );

  constructor() {
    this.form = this.fb.group({
      id_sede: [null, Validators.required],
      id_tipo_cita: [null, Validators.required],
      id_paciente: [null, Validators.required],
      id_personal: [null],
      id_tratamiento: [null],
      id_sala: [null],
      id_equipo: [null],
      fecha_cita: [this.fechaDia.value, Validators.required],
      hora_inicio: ['09:00', Validators.required],
      notas: [''],
    });
  }

  ngOnInit() {
    this.service.tiposCita().subscribe({
      next: (res: any) => {
        const list = res.data?.data || res.data || res || [];
        this.tiposCita.set(list);
        const simple = list.find((t: any) => t.codigo === 'CITA_SIMPLE');
        if (simple) {
          this.form.patchValue({ id_tipo_cita: simple.id_tipo_cita });
          this.tipoSel.set(simple);
        }
      },
    });
    this.sedesService.findAll(1, 100, '').subscribe({
      next: (res: any) => {
        const list = res.data?.data || res.data || [];
        this.sedes.set(list);
        const sede = this.sedeCtx.idSedeFiltro() || list[0]?.id_sede || null;
        if (sede) {
          this.form.patchValue({ id_sede: sede });
          this.cargarSalasEquipos(sede);
        }
        this.cargarDia();
      },
    });
    this.personalService.findAll(1, 200, '').subscribe({
      next: (res: any) => this.personal.set(res.data?.data || res.data || []),
    });
    this.pacientesService.findAll(1, 200, '').subscribe({
      next: (res: any) => this.pacientes.set(res.data?.data || res.data || []),
    });
    this.tratamientosService.findAll(1, 200, '').subscribe({
      next: (res: any) => this.tratamientos.set(res.data?.data || res.data || []),
    });

    this.fechaDia.valueChanges.subscribe((f) => {
      this.form.patchValue({ fecha_cita: f });
      this.cargarDia();
    });
    this.form.get('id_sede')?.valueChanges.subscribe((id) => {
      if (id) {
        this.cargarSalasEquipos(id);
        this.cargarDia();
        this.cargarWaitlist();
      }
    });
    this.form.get('id_tipo_cita')?.valueChanges.subscribe((id) => {
      const tipo = this.tiposCita().find((t) => Number(t.id_tipo_cita) === Number(id)) || null;
      this.tipoSel.set(tipo);
      this.validacion.set(null);
      this.sugerencia.set(null);
      if (!Number(tipo?.requiere_tratamiento)) {
        this.form.patchValue({ id_tratamiento: null, id_sala: null, id_equipo: null });
      } else if (!Number(tipo?.requiere_sala) && !Number(tipo?.requiere_equipo)) {
        // sala/equipo pueden depender del tratamiento; no forzar limpieza total
      }
    });
    this.form.get('id_paciente')?.valueChanges.subscribe((id) => {
      if (id) this.cargarPaquetes(id);
      else this.paquetes.set([]);
    });
    this.form.get('id_tratamiento')?.valueChanges.subscribe(() => this.validacion.set(null));
  }

  cargarSalasEquipos(idSede: number) {
    this.sedesService.listSalas(idSede).subscribe({
      next: (res: any) => this.salas.set(res.data?.data || res.data || res || []),
    });
    this.sedesService.listEquipos(idSede).subscribe({
      next: (res: any) => this.equipos.set(res.data?.data || res.data || res || []),
    });
  }

  cargarDia() {
    const sede = this.form.get('id_sede')?.value || this.sedeCtx.idSedeFiltro();
    const fecha = this.fechaDia.value;
    if (!sede || !fecha) return;
    this.loading.set(true);
    this.service.dia(fecha, Number(sede)).subscribe({
      next: (res: any) => {
        this.dayData.set(res.data || res);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.alert.error('No se pudo cargar la agenda del día');
      },
    });
    this.cargarWaitlist();
  }

  cargarWaitlist() {
    const sede = this.form.get('id_sede')?.value;
    if (!sede) return;
    this.service.listaEspera({ id_sede: sede, estado: 'PENDIENTE', page: 1, limit: 20 }).subscribe({
      next: (res: any) => this.waitlist.set(res.data?.data || res.data || []),
    });
  }

  cargarPaquetes(idPaciente: number) {
    this.service.paquetesPaciente(idPaciente).subscribe({
      next: (res: any) => this.paquetes.set(res.data?.data || res.data || res || []),
    });
  }

  toMin(hora: string): number {
    const [h, m] = String(hora).slice(0, 5).split(':').map(Number);
    return h * 60 + m;
  }

  pctLeft(hora: string): number {
    const min = this.toMin(hora);
    return ((min - this.dayStartMin) / (this.dayEndMin - this.dayStartMin)) * 100;
  }

  pctWidth(horaIni: string, horaFin: string): number {
    const w = this.toMin(horaFin) - this.toMin(horaIni);
    return (w / (this.dayEndMin - this.dayStartMin)) * 100;
  }

  bloquesPara(res: any): any[] {
    const data = this.dayData();
    if (!data?.citas) return [];
    return data.citas.filter((c: any) => {
      if (res.kind === 'prof') {
        if (Number(c.id_personal) === Number(res.id)) return true;
        return (c.participantes || []).some((p: any) => Number(p.id_personal) === Number(res.id));
      }
      if (res.kind === 'room') return Number(c.id_sala) === Number(res.id);
      if (res.kind === 'equipment') return Number(c.id_equipo) === Number(res.id);
      return false;
    });
  }

  finBloque(c: any, kind: string): string {
    if (kind === 'prof') return String(c.hora_fin).slice(0, 5);
    return String(c.hora_fin_recurso || c.hora_fin).slice(0, 5);
  }

  colorCita(c: any): string {
    if (c.estado === 'EN_ATENCION') return '#C97F86';
    if (c.estado === 'FINALIZADA') return '#5B6960';
    if (c.estado === 'CONFIRMADA') return '#4C6B8A';
    return c.color_agenda || '#1F4E4A';
  }

  labelEstado(estado: string): string {
    const map: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      CONFIRMADA: 'Confirmada',
      EN_ATENCION: 'En atención',
      FINALIZADA: 'Finalizada',
      CANCELADA: 'Cancelada',
      NO_ASISTIO: 'No asistió',
      REPROGRAMADA: 'Reprogramada',
    };
    return map[estado] || estado;
  }

  puedeIniciar(c: any): boolean {
    return ['PENDIENTE', 'CONFIRMADA'].includes(c?.estado);
  }

  puedeFinalizar(c: any): boolean {
    return ['PENDIENTE', 'CONFIRMADA', 'EN_ATENCION'].includes(c?.estado);
  }

  puedeCancelar(c: any): boolean {
    return !['FINALIZADA', 'CANCELADA'].includes(c?.estado);
  }

  cambiarEstadoCita(modal: any, estado: string) {
    const c = this.citaDetalle();
    if (!c) return;
    this.service.cambiarEstado(c.id_cita, estado).subscribe({
      next: () => {
        modal.close();
        this.alert.success(`Cita: ${this.labelEstado(estado)}`);
        this.cargarDia();
      },
      error: (e) => this.alert.error(e.error?.mensaje || 'No se pudo cambiar el estado'),
    });
  }

  slotsHora(): string[] {
    return this.horasSlots.map((h) => h.id);
  }

  payloadForm() {
    const raw = this.form.getRawValue();
    const tipo = this.tipoSel();
    const needTrat = !!Number(tipo?.requiere_tratamiento);
    const toId = (v: unknown) => (v == null || v === '' ? null : Number(v));
    return {
      id_sede: Number(raw.id_sede),
      id_tipo_cita: Number(raw.id_tipo_cita),
      id_paciente: Number(raw.id_paciente),
      id_personal: toId(raw.id_personal),
      id_tratamiento: needTrat ? toId(raw.id_tratamiento) : null,
      // Sala/equipo: si el usuario los eligió, siempre se envían (aunque el tipo no los exija)
      id_sala: toId(raw.id_sala),
      id_equipo: toId(raw.id_equipo),
      fecha_cita: raw.fecha_cita,
      hora_inicio: raw.hora_inicio?.length === 5 ? raw.hora_inicio + ':00' : raw.hora_inicio,
      notas: raw.notas || null,
    };
  }

  limpiarFormularioCita() {
    const sede = this.form.get('id_sede')?.value;
    const fecha = this.fechaDia.value;
    const tipoId = this.form.get('id_tipo_cita')?.value;
    const tipo = this.tiposCita().find((t) => Number(t.id_tipo_cita) === Number(tipoId)) || null;
    this.form.reset({
      id_sede: sede,
      id_tipo_cita: tipoId,
      id_paciente: null,
      id_personal: null,
      id_tratamiento: null,
      id_sala: null,
      id_equipo: null,
      fecha_cita: fecha,
      hora_inicio: '09:00',
      notas: '',
    });
    this.tipoSel.set(tipo);
    this.validacion.set(null);
    this.sugerencia.set(null);
    this.paquetes.set([]);
  }

  validar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.alert.showLoading('Validando...');
    this.sugerencia.set(null);
    this.service.validar(this.payloadForm()).subscribe({
      next: (res: any) => {
        this.alert.closeLoading();
        const data = res.data || res;
        this.validacion.set(data);
        if (!data.ok && !data.valida) {
          this.service.sugerirHorario(this.payloadForm()).subscribe({
            next: (s: any) => {
              const sug = s.data || s;
              if (sug.encontrado) this.sugerencia.set(sug.hora_inicio);
            },
          });
        }
      },
      error: (err) => {
        this.alert.closeLoading();
        const data = err.error?.data || err.error;
        if (data?.steps) this.validacion.set(data);
        else this.alert.error(err.error?.mensaje || 'Validación fallida');
      },
    });
  }

  agendar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.alert.showLoading('Agendando...');
    this.service.create(this.payloadForm()).subscribe({
      next: (res: any) => {
        this.alert.closeLoading();
        const data = res.data || res;
        this.validacion.set(data);
        this.alert.success('Cita creada');
        this.limpiarFormularioCita();
        this.cargarDia();
      },
      error: (err) => {
        this.alert.closeLoading();
        const data = err.error?.data || err.error;
        if (data?.steps) {
          this.validacion.set(data);
          const fail = (data.steps || []).find((s: any) => !s.pass);
          this.alert.error(
            err.error?.mensaje || fail?.msg || 'No se pudo agendar',
          );
          this.service.sugerirHorario(this.payloadForm()).subscribe({
            next: (s: any) => {
              const sug = s.data || s;
              if (sug.encontrado) this.sugerencia.set(sug.hora_inicio);
              else this.sugerencia.set(null);
            },
          });
        } else {
          this.alert.error(err.error?.mensaje || 'No se pudo agendar');
        }
      },
    });
  }

  usarSugerencia() {
    const h = this.sugerencia();
    if (!h) return;
    this.form.patchValue({ hora_inicio: String(h).slice(0, 5) });
    this.agendar();
  }

  agregarEspera() {
    const raw = this.form.getRawValue();
    if (!raw.id_paciente || !raw.id_sede || !raw.id_tratamiento) {
      this.alert.warning('Indique paciente, sede y tratamiento');
      return;
    }
    this.service
      .addListaEspera({
        id_sede: raw.id_sede,
        id_paciente: raw.id_paciente,
        id_tratamiento: raw.id_tratamiento || null,
        fecha_preferida: raw.fecha_cita,
      })
      .subscribe({
        next: () => {
          this.alert.success('Agregado a lista de espera');
          this.cargarWaitlist();
        },
        error: (e) => this.alert.error(e.error?.mensaje || 'No se pudo agregar'),
      });
  }

  abrirDetalle(c: any, tpl: any) {
    this.service.findOne(c.id_cita).subscribe({
      next: (res: any) => {
        this.citaDetalle.set(res.data || res);
        this.modal.open(tpl, { centered: true, size: 'md' });
      },
    });
  }

  cancelarCita(modal: any) {
    const c = this.citaDetalle();
    if (!c) return;
    this.alert.confirmAction('¿Cancelar cita?', 'Se liberarán los recursos.', 'Sí, cancelar').then((ok) => {
      if (!ok) return;
      this.service.cancelar(c.id_cita, 'Cancelación desde agenda').subscribe({
        next: (res: any) => {
          const data = res.data || res;
          modal.close();
          this.alert.success(
            data.reasignado
              ? 'Cita cancelada y reasignada desde lista de espera'
              : data.penalidad_aplicada
                ? 'Cita cancelada (penalidad <24h marcada)'
                : 'Cita cancelada',
          );
          this.cargarDia();
        },
        error: (e) => this.alert.error(e.error?.mensaje || 'Error al cancelar'),
      });
    });
  }

  completarCita(modal: any) {
    const c = this.citaDetalle();
    if (!c) return;
    this.service.completar(c.id_cita).subscribe({
      next: () => {
        modal.close();
        this.alert.success('Cita finalizada');
        this.cargarDia();
      },
      error: (e) => this.alert.error(e.error?.mensaje || 'Error al finalizar'),
    });
  }

  labelPaciente = (p: any) =>
    p ? `${p.apellidos || ''} ${p.nombres || ''}`.trim() + (p.numero_documento ? ` · ${p.numero_documento}` : '') : '';

  labelPersonal = (p: any) =>
    p ? `${p.apellidos || ''} ${p.nombres || ''}`.trim() + (p.especialidad ? ` · ${p.especialidad}` : '') : '';
}
