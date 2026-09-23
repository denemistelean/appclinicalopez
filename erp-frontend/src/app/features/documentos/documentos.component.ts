import {
  Component,
  inject,
  OnInit,
  TemplateRef,
  ChangeDetectionStrategy,
  signal,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { useCrud } from 'src/app/core/utils/crud.util';
import { TableProComponent } from 'src/app/shared/components/table-pro/table-pro.component';
import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { PacientesService } from '../pacientes/pacientes.service';
import { DocumentosService } from './documentos.service';

@Component({
  selector: 'app-documentos',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TableProComponent,
    FormErrorComponent,
    NgbModalModule,
    NgSelectModule,
  ],
  templateUrl: './documentos.component.html',
  styleUrl: './documentos.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(DocumentosService);
  private pacientesService = inject(PacientesService);
  private alert = inject(AlertService);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  public perms = inject(PermissionsService);

  public crud = useCrud<any>(this.service as any, { itemName: 'Documento' });

  tab = signal<'docs' | 'tipos'>('docs');
  pacientes = signal<any[]>([]);
  tipos = signal<any[]>([]);
  tiposAll = signal<any[]>([]);
  consultas = signal<any[]>([]);
  raiz = signal('');
  archivoSeleccionado: File | null = null;
  form: FormGroup;
  formTipo: FormGroup;
  editingTipoId: number | null = null;

  constructor() {
    this.form = this.fb.group({
      id_paciente: [null, Validators.required],
      id_tipo_documento: [null, Validators.required],
      id_consulta: [null],
      titulo: [''],
      fecha_documento: [''],
      observaciones: [''],
    });
    this.formTipo = this.fb.group({
      codigo: ['', Validators.required],
      nombre: ['', Validators.required],
      descripcion: [''],
      extensiones: ['pdf,jpg,jpeg,png'],
      activo: [true],
    });
  }

  ngOnInit() {
    this.cargarPacientes();
    this.cargarTipos();
    this.service.getRaiz().subscribe({
      next: (res: any) => this.raiz.set(res.data?.documentos_root || res.documentos_root || ''),
      error: () => this.raiz.set(''),
    });
    this.form.get('id_paciente')?.valueChanges.subscribe((id) => {
      this.consultas.set([]);
      this.form.patchValue({ id_consulta: null }, { emitEvent: false });
      if (id) this.cargarConsultas(Number(id));
    });
  }

  setTab(t: 'docs' | 'tipos') {
    this.tab.set(t);
    if (t === 'tipos') this.cargarTiposAll();
  }

  cargarPacientes() {
    this.pacientesService.findAll(1, 300, '').subscribe({
      next: (res: any) => {
        const list = (res.data?.data || res.data || []).map((p: any) => ({
          ...p,
          label: `${p.apellidos || ''} ${p.nombres || ''}`.trim() + (p.numero_documento ? ` (${p.numero_documento})` : ''),
        }));
        this.pacientes.set(list);
        this.cdr.markForCheck();
      },
    });
  }

  cargarTipos() {
    this.service.listTipos().subscribe({
      next: (res: any) => {
        this.tipos.set(res.data?.data || res.data || []);
        this.cdr.markForCheck();
      },
      error: () => this.tipos.set([]),
    });
  }

  cargarTiposAll() {
    this.service.listTiposAll(1, 200, '').subscribe({
      next: (res: any) => {
        this.tiposAll.set(res.data?.data || res.data || []);
        this.cdr.markForCheck();
      },
      error: () => this.tiposAll.set([]),
    });
  }

  cargarConsultas(idPaciente: number) {
    this.service.consultasPaciente(idPaciente).subscribe({
      next: (res: any) => {
        const list = (res.data || res || []).map((c: any) => ({
          ...c,
          label: `#${c.id_consulta} · ${c.fecha_consulta || ''} · ${c.motivo_consulta || c.estado}`,
        }));
        this.consultas.set(list);
        this.cdr.markForCheck();
      },
      error: () => this.consultas.set([]),
    });
  }

  onSearch(term: string) {
    this.crud.searchControl.setValue(term);
  }

  onFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.archivoSeleccionado = input.files?.[0] || null;
  }

  abrirModalSubir(modalTemplate: TemplateRef<any>) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.archivoSeleccionado = null;
    this.form.reset({ id_consulta: null, titulo: '', fecha_documento: '', observaciones: '' });
    this.consultas.set([]);
    this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static', size: 'lg' });
  }

  guardarUpload(modal: any) {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.archivoSeleccionado) {
      this.alert.error('Seleccione un archivo.');
      return;
    }
    const v = this.form.getRawValue();
    const fd = new FormData();
    fd.append('archivo', this.archivoSeleccionado);
    fd.append('id_paciente', String(v.id_paciente));
    fd.append('id_tipo_documento', String(v.id_tipo_documento));
    if (v.id_consulta) fd.append('id_consulta', String(v.id_consulta));
    if (v.titulo) fd.append('titulo', v.titulo);
    if (v.fecha_documento) fd.append('fecha_documento', v.fecha_documento);
    if (v.observaciones) fd.append('observaciones', v.observaciones);

    this.alert.showLoading('Subiendo documento...');
    this.service.upload(fd).subscribe({
      next: () => {
        this.alert.closeLoading();
        this.alert.toast('Documento guardado', 'success');
        modal.close();
        this.crud.refresh();
      },
      error: (err) => {
        this.alert.closeLoading();
        this.alert.error(err?.error?.mensaje || err?.error?.message || 'No se pudo subir.');
      },
    });
  }

  async verArchivo(item: any) {
    const token = localStorage.getItem('token') || '';
    const url = this.service.archivoUrl(item.id_documento);
    try {
      const blob = await this.http
        .get(url, {
          headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
          responseType: 'blob',
        })
        .toPromise();
      if (!blob) return;
      const obj = URL.createObjectURL(blob);
      window.open(obj, '_blank');
    } catch {
      this.alert.error('No se pudo abrir el archivo.');
    }
  }

  abrirModalTipo(modalTemplate: TemplateRef<any>, item?: any) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (item) {
      this.editingTipoId = item.id_tipo_documento;
      this.formTipo.patchValue({
        codigo: item.codigo,
        nombre: item.nombre,
        descripcion: item.descripcion || '',
        extensiones: item.extensiones || 'pdf,jpg,jpeg,png',
        activo: !!Number(item.activo),
      });
    } else {
      this.editingTipoId = null;
      this.formTipo.reset({ codigo: '', nombre: '', descripcion: '', extensiones: 'pdf,jpg,jpeg,png', activo: true });
    }
    this.crud.openModal(modalTemplate, { centered: true, backdrop: 'static' });
  }

  guardarTipo(modal: any) {
    if (this.formTipo.invalid) {
      this.formTipo.markAllAsTouched();
      return;
    }
    const raw = this.formTipo.getRawValue();
    const payload = {
      ...raw,
      codigo: String(raw.codigo || '').trim().toUpperCase(),
    };
    const req = this.editingTipoId
      ? this.service.updateTipo(this.editingTipoId, payload)
      : this.service.createTipo(payload);
    this.alert.showLoading('Guardando...');
    req.subscribe({
      next: () => {
        this.alert.closeLoading();
        this.alert.toast('Tipo guardado', 'success');
        modal.close();
        this.cargarTipos();
        this.cargarTiposAll();
      },
      error: (err) => {
        this.alert.closeLoading();
        this.alert.error(err?.error?.mensaje || 'No se pudo guardar.');
      },
    });
  }

  async eliminarTipo(item: any) {
    const ok = await this.alert.confirmAction('¿Eliminar tipo?', item.nombre, 'Sí, eliminar');
    if (!ok) return;
    this.service.deleteTipo(item.id_tipo_documento).subscribe({
      next: () => {
        this.alert.toast('Tipo eliminado', 'success');
        this.cargarTipos();
        this.cargarTiposAll();
      },
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo eliminar.'),
    });
  }
}
