import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { Subject, catchError, debounceTime, distinctUntilChanged, filter, of, switchMap } from 'rxjs';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { FormErrorComponent } from 'src/app/shared/components/form-error/form-error.component';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { PacientesService } from '../pacientes/pacientes.service';
import { MapaCorporalService } from './mapa-corporal.service';
import {
  ESTADOS_MAPA,
  MAPA_GLB_URL,
  PROCEDIMIENTOS_MAPA,
  ZONAS_ANATOMICAS,
} from './mapa-corporal.zones';

type MarkerMesh = {
  zonaCodigo: string;
  zonaLabel: string;
  lado: string;
  origen: 'CATALOGO' | 'MANUAL';
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  recordId?: number;
};

@Component({
  selector: 'app-mapa-corporal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgSelectModule, FormErrorComponent],
  templateUrl: './mapa-corporal.component.html',
  styleUrl: './mapa-corporal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapaCorporalComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasHost', { static: true }) canvasHost!: ElementRef<HTMLDivElement>;

  private fb = inject(FormBuilder);
  private service = inject(MapaCorporalService);
  private pacientesService = inject(PacientesService);
  private alert = inject(AlertService);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  public perms = inject(PermissionsService);

  readonly pacTypeahead$ = new Subject<string>();
  pacientes = signal<any[]>([]);
  pacientesLoading = signal(false);
  registros = signal<any[]>([]);
  loadingModel = signal(true);
  modelError = signal('');
  modoInsertar = signal(false);
  hideEmpty = signal(false);
  autoRotate = signal(false);
  selectedCodigo = signal<string | null>(null);

  procedimientos = PROCEDIMIENTOS_MAPA;
  estados = ESTADOS_MAPA;
  formPac: FormGroup;
  formZona: FormGroup;

  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private bodyModel?: THREE.Object3D;
  private modelSize = new THREE.Vector3();
  private animId = 0;
  private markers: MarkerMesh[] = [];
  private onResize = () => this.resize();
  private onClick = (e: MouseEvent) => this.onCanvasClick(e);

  constructor() {
    this.formPac = this.fb.group({
      id_paciente: [null, Validators.required],
    });
    this.formZona = this.fb.group({
      id_mapa_marcador: [null],
      zona_codigo: [''],
      zona_label: ['', Validators.required],
      lado: ['Frontal'],
      origen: ['CATALOGO'],
      procedimiento: [null, Validators.required],
      estado: ['PLANIFICADO', Validators.required],
      fecha_plan: [''],
      notas: [''],
      pos_x: [0],
      pos_y: [0],
      pos_z: [0],
    });
  }

  ngAfterViewInit() {
    this.pacTypeahead$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        filter((t) => (t || '').trim().length >= 2),
        switchMap((term) => {
          this.pacientesLoading.set(true);
          return this.pacientesService.findAll(1, 50, term.trim()).pipe(
            catchError(() => of({ data: { data: [] } })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res: any) => {
        this.pacientesLoading.set(false);
        const list = (res.data?.data || res.data || []).map((p: any) => ({
          ...p,
          label: this.labelPaciente(p),
        }));
        this.pacientes.set(list);
        this.cdr.markForCheck();
      });

    this.formPac.get('id_paciente')?.valueChanges.subscribe((id) => {
      this.selectedCodigo.set(null);
      if (id) {
        this.asegurarPaciente(Number(id));
        this.cargarRegistros(Number(id));
      } else {
        this.registros.set([]);
        this.refreshMarkerColors();
      }
      this.cdr.markForCheck();
    });

    this.initScene();
    this.loadModel();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.onResize);
    this.renderer?.domElement.removeEventListener('click', this.onClick);
    this.controls?.dispose();
    this.renderer?.dispose();
    this.scene?.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }

  labelPaciente = (p: any) =>
    p
      ? `${p.apellidos || ''} ${p.nombres || ''}`.trim() +
        (p.numero_documento ? ` · ${p.numero_documento}` : '')
      : '';

  private asegurarPaciente(id: number) {
    if (this.pacientes().some((p) => Number(p.id_paciente) === id)) return;
    this.pacientesService.findOne(id).subscribe({
      next: (res: any) => {
        const p = res.data?.data || res.data;
        if (!p) return;
        this.pacientes.update((list) => [{ ...p, label: this.labelPaciente(p) }, ...list]);
        this.cdr.markForCheck();
      },
    });
  }

  cargarRegistros(idPaciente: number) {
    this.service.list(idPaciente).subscribe({
      next: (res: any) => {
        const list = res.data?.data || res.data || [];
        this.registros.set(list);
        this.syncManualMarkers(list);
        this.refreshMarkerColors();
        this.cdr.markForCheck();
      },
      error: () => {
        this.registros.set([]);
        this.cdr.markForCheck();
      },
    });
  }

  private initScene() {
    const el = this.canvasHost.nativeElement;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe9edec);
    this.camera = new THREE.PerspectiveCamera(40, el.clientWidth / Math.max(el.clientHeight, 1), 0.01, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.9);
    dir1.position.set(2, 4, 3);
    this.scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dir2.position.set(-3, 2, -2);
    this.scene.add(dir2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 20;

    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('click', this.onClick);
    this.animate();
  }

  private animate = () => {
    this.animId = requestAnimationFrame(this.animate);
    this.controls?.update();
    if (this.scene && this.camera && this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
  };

  private resize() {
    const el = this.canvasHost.nativeElement;
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(el.clientWidth, el.clientHeight);
  }

  private loadModel() {
    const loader = new GLTFLoader();
    loader.load(
      MAPA_GLB_URL,
      (gltf) => {
        this.bodyModel = gltf.scene;
        const box = new THREE.Box3().setFromObject(this.bodyModel);
        const center = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(this.modelSize);
        this.bodyModel.position.sub(center);
        this.scene?.add(this.bodyModel);
        this.placeCamera();
        this.placeCatalogMarkers();
        this.loadingModel.set(false);
        this.cdr.markForCheck();
      },
      undefined,
      (err) => {
        this.loadingModel.set(false);
        this.modelError.set(
          'No se pudo cargar el modelo 3D. Coloca cuerpo.glb en erp-frontend/src/assets/models/',
        );
        console.error(err);
        this.cdr.markForCheck();
      },
    );
  }

  resetView() {
    this.placeCamera();
  }

  toggleAutoRotate() {
    const next = !this.autoRotate();
    this.autoRotate.set(next);
    if (this.controls) {
      this.controls.autoRotate = next;
      this.controls.autoRotateSpeed = 2;
    }
  }

  toggleEmpty() {
    this.hideEmpty.set(!this.hideEmpty());
    this.refreshMarkerColors();
  }

  setModoInsertar(on: boolean) {
    this.modoInsertar.set(on);
  }

  private placeCamera() {
    if (!this.camera || !this.controls) return;
    const maxDim = Math.max(this.modelSize.x, this.modelSize.y, this.modelSize.z) || 1;
    const dist = maxDim * 1.6;
    this.camera.position.set(0, this.modelSize.y * 0.15, dist);
    this.camera.near = maxDim / 100;
    this.camera.far = maxDim * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, this.modelSize.y * 0.1, 0);
    this.controls.minDistance = maxDim * 0.3;
    this.controls.maxDistance = maxDim * 4;
    this.controls.update();
  }

  private markerRadius() {
    return Math.max(this.modelSize.x, this.modelSize.y, this.modelSize.z) * 0.012;
  }

  private placeCatalogMarkers() {
    if (!this.bodyModel || !this.scene) return;
    const halfX = this.modelSize.x / 2;
    const halfZ = this.modelSize.z / 2;
    const bottomY = -this.modelSize.y / 2;
    const r = this.markerRadius();

    ZONAS_ANATOMICAS.forEach((zone) => {
      const targetX = zone.xFrac * halfX;
      const targetY = bottomY + zone.yFrac * this.modelSize.y;
      const rayDistance = halfZ * 3 + this.modelSize.z;
      const originZ = zone.side === 'front' ? rayDistance : -rayDistance;
      const dirZ = zone.side === 'front' ? -1 : 1;
      const origin = new THREE.Vector3(targetX, targetY, originZ);
      const direction = new THREE.Vector3(0, 0, dirZ);
      const rc = new THREE.Raycaster(origin, direction);
      const hits = rc.intersectObject(this.bodyModel!, true);
      if (!hits.length) return;
      const point = hits[0].point.clone();
      point.add(direction.clone().multiplyScalar(-1).multiplyScalar(r * 1.8));
      this.addSphere(zone.id, zone.label, zone.side === 'front' ? 'Frontal' : 'Posterior', 'CATALOGO', point);
    });
    this.refreshMarkerColors();
  }

  private addSphere(
    codigo: string,
    label: string,
    lado: string,
    origen: 'CATALOGO' | 'MANUAL',
    point: THREE.Vector3,
    recordId?: number,
  ) {
    if (!this.scene) return;
    const geo = new THREE.SphereGeometry(this.markerRadius(), 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8fa39e });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.position.copy(point);
    sphere.userData['zonaCodigo'] = codigo;
    this.scene.add(sphere);
    this.markers.push({
      zonaCodigo: codigo,
      zonaLabel: label,
      lado,
      origen,
      mesh: sphere,
      pos: point.clone(),
      recordId,
    });
  }

  private syncManualMarkers(list: any[]) {
    this.markers
      .filter((m) => m.origen === 'MANUAL')
      .forEach((m) => {
        this.scene?.remove(m.mesh);
        m.mesh.geometry.dispose();
        (m.mesh.material as THREE.Material).dispose();
      });
    this.markers = this.markers.filter((m) => m.origen !== 'MANUAL');
    for (const rec of list) {
      if (rec.origen !== 'MANUAL') continue;
      const p = new THREE.Vector3(Number(rec.pos_x), Number(rec.pos_y), Number(rec.pos_z));
      this.addSphere(rec.zona_codigo, rec.zona_label, rec.lado, 'MANUAL', p, rec.id_mapa_marcador);
    }
  }

  private recordFor(codigo: string) {
    return this.registros().find((r) => r.zona_codigo === codigo);
  }

  private refreshMarkerColors() {
    const sel = this.selectedCodigo();
    const hide = this.hideEmpty();
    this.markers.forEach((m) => {
      const rec = this.recordFor(m.zonaCodigo);
      const isSelected = sel === m.zonaCodigo;
      let color = 0x8fa39e;
      if (rec) color = 0x1f5f57;
      if (isSelected) color = 0xb97a5d;
      (m.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      m.mesh.visible = hide ? !!(rec || isSelected) : true;
    });
  }

  private onCanvasClick(event: MouseEvent) {
    if (!this.renderer || !this.camera) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const markerHits = this.raycaster.intersectObjects(this.markers.map((m) => m.mesh));
    if (markerHits.length) {
      const codigo = String(markerHits[0].object.userData['zonaCodigo'] || '');
      this.selectMarker(codigo);
      return;
    }

    if (this.modoInsertar() && this.bodyModel) {
      if (!this.formPac.value.id_paciente) {
        this.alert.warning('Seleccione un paciente antes de insertar un punto.');
        return;
      }
      const hits = this.raycaster.intersectObject(this.bodyModel, true);
      if (!hits.length) return;
      const point = hits[0].point.clone();
      const codigo = `personalizado-${Date.now()}`;
      this.addSphere(codigo, 'Punto personalizado', 'Personalizado', 'MANUAL', point);
      this.selectMarker(codigo);
    }
  }

  selectMarker(codigo: string) {
    const m = this.markers.find((x) => x.zonaCodigo === codigo);
    if (!m) return;
    this.selectedCodigo.set(codigo);
    const rec = this.recordFor(codigo);
    this.formZona.reset({
      id_mapa_marcador: rec?.id_mapa_marcador ?? null,
      zona_codigo: codigo,
      zona_label: rec?.zona_label || m.zonaLabel,
      lado: rec?.lado || m.lado,
      origen: rec?.origen || m.origen,
      procedimiento: rec?.procedimiento ?? null,
      estado: rec?.estado || 'PLANIFICADO',
      fecha_plan: rec?.fecha_plan ? String(rec.fecha_plan).slice(0, 10) : '',
      notas: rec?.notas || '',
      pos_x: m.pos.x,
      pos_y: m.pos.y,
      pos_z: m.pos.z,
    });
    this.refreshMarkerColors();
    this.cdr.markForCheck();
  }

  guardarZona() {
    if (!this.perms.hasPermission('crear_mapa_marcador') && !this.formZona.value.id_mapa_marcador) {
      this.alert.warning('Sin permiso para crear marcadores.');
      return;
    }
    if (!this.formPac.value.id_paciente) {
      this.alert.warning('Seleccione un paciente.');
      return;
    }
    if (this.formZona.invalid) {
      this.formZona.markAllAsTouched();
      return;
    }
    const z = this.formZona.getRawValue();
    const payload = {
      id_paciente: Number(this.formPac.value.id_paciente),
      zona_codigo: z.zona_codigo,
      zona_label: z.zona_label,
      lado: z.lado,
      procedimiento: z.procedimiento,
      estado: z.estado,
      fecha_plan: z.fecha_plan || null,
      notas: z.notas || null,
      pos_x: Number(z.pos_x),
      pos_y: Number(z.pos_y),
      pos_z: Number(z.pos_z),
      origen: z.origen || 'CATALOGO',
    };
    const id = z.id_mapa_marcador ? Number(z.id_mapa_marcador) : null;
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    this.alert.showLoading('Guardando...');
    req$.subscribe({
      next: () => {
        this.alert.closeLoading();
        this.alert.toast('Marcador guardado', 'success');
        this.cargarRegistros(Number(this.formPac.value.id_paciente));
      },
      error: (err) => {
        this.alert.closeLoading();
        this.alert.error(err?.error?.mensaje || 'No se pudo guardar.');
      },
    });
  }

  async quitarZona() {
    const id = Number(this.formZona.value.id_mapa_marcador);
    if (!id || !this.perms.hasPermission('eliminar_mapa_marcador')) return;
    const ok = await this.alert.confirmAction('¿Quitar registro?', 'El punto dejará de figurar en el seguimiento.', 'Sí, quitar');
    if (!ok) return;
    this.service.delete(id).subscribe({
      next: () => {
        this.alert.toast('Eliminado', 'success');
        this.selectedCodigo.set(null);
        this.cargarRegistros(Number(this.formPac.value.id_paciente));
      },
      error: (err) => this.alert.error(err?.error?.mensaje || 'No se pudo eliminar.'),
    });
  }

  estadoLabel(est: string) {
    return this.estados.find((e) => e.id === est)?.nombre || est;
  }
}
