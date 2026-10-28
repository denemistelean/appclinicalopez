export interface SemillaItem {
  codigo: string;
  tipo: 'servicio' | 'paquete';
  categoria: string;
  nombre: string;
  monto: number | null;
  sesiones?: number;
  nota?: string;
  sinTarifa?: boolean;
  componentes?: { codigo: string; cantidad: number }[];
}

const MOTIVO = 'Tarifa inicial';
const FACIAL = 'Facial';

function servicio(codigo: string, categoria: string, nombre: string, monto: number | null, extra: Partial<SemillaItem> = {}): SemillaItem {
  return { codigo, tipo: 'servicio', categoria, nombre, monto, ...extra };
}

function zonas(genero: string, lista: string, inicio: number): SemillaItem[] {
  return lista.split(',').map((par, i) => {
    const [zona, precio] = par.split(':');
    const n = String(inicio + i).padStart(3, '0');
    return servicio(`SRV-${n}`, `Depilación ${genero}`, `Depilación láser — ${zona} (${genero})`, Number(precio));
  });
}

const MUJER = 'Cara completa:100,Frente:30,Mejillas:30,Patillas:30,Bozo:30,Entrecejo:30,Nuca:80,Brazos completos:200,Medio brazo:100,Manos:50,Axilas:50,Piernas completas:250,Media pierna:130,Muslo:150,Glúteos:120,Espalda completa:200,Abdomen:150,Línea alba:50,Bikini:100,Brasilero:150';
const HOMBRE = 'Cara completa:150,Frente:50,Mejillas:50,Patillas:50,Bozo:50,Entrecejo:50,Barba:80,Nuca:80,Brazos completos:260,Medio brazo:150,Manos:60,Axilas:50,Piernas completas:260,Media pierna:150,Muslo:180,Glúteos:150,Espalda completa:200,Abdomen:150,Línea alba:60,Pecho:150';

const faciales: SemillaItem[] = [
  servicio('SRV-001', FACIAL, 'Limpieza facial simple', 80),
  servicio('SRV-002', FACIAL, 'Limpieza facial profunda', 180),
  servicio('SRV-003', FACIAL, 'Hidratación con vitamina C', 150),
  servicio('SRV-004', FACIAL, 'Pink Glow', 400, { sesiones: 2, nota: 'Incluye 2 sesiones, intervalo 15 días. La limpieza se registra aparte.' }),
  servicio('SRV-005', FACIAL, 'Radiofrecuencia (por sesión)', 300),
  servicio('SRV-006', FACIAL, 'Máscara LED', null, { sinTarifa: true, nota: 'Solo componente de paquetes faciales; sin tarifa individual.' }),
];

const indiba: SemillaItem[] = [
  ['Rostro completo', 100], ['Papada', 70], ['Párpados', 60], ['Mamas', 100],
].map(([nombre, monto], i) => servicio(`SRV-${String(7 + i).padStart(3, '0')}`, 'INDIBA postoperatorio', `INDIBA postoperatorio — ${nombre}`, Number(monto)));

const depMujer = zonas('Mujer', MUJER, 11);
const depHombre = zonas('Hombre', HOMBRE, 11 + depMujer.length);

function paqueteDepilacion(servicioItem: SemillaItem, indice: number): SemillaItem {
  const zona = servicioItem.nombre.replace('Depilación láser — ', '');
  return {
    codigo: `PAQ-${String(indice).padStart(3, '0')}`,
    tipo: 'paquete',
    categoria: servicioItem.categoria,
    nombre: `Paquete 5 sesiones — ${zona}`,
    monto: Number(servicioItem.monto) * 5,
    sesiones: 5,
    componentes: [{ codigo: servicioItem.codigo, cantidad: 5 }],
  };
}

const depilacion = [...depMujer, ...depHombre];
const paquetesDep = depilacion.map((item, i) => paqueteDepilacion(item, i + 1));

const paquetesResto: SemillaItem[] = [
  {
    codigo: `PAQ-${String(paquetesDep.length + 1).padStart(3, '0')}`,
    tipo: 'paquete', categoria: FACIAL, nombre: 'Tratamiento facial', monto: 1200,
    componentes: [
      { codigo: 'SRV-002', cantidad: 1 }, { codigo: 'SRV-003', cantidad: 2 },
      { codigo: 'SRV-005', cantidad: 3 }, { codigo: 'SRV-006', cantidad: 2 },
    ],
  },
  {
    codigo: `PAQ-${String(paquetesDep.length + 2).padStart(3, '0')}`,
    tipo: 'paquete', categoria: FACIAL, nombre: 'Tratamiento facial + Pink Glow', monto: 1800,
    nota: 'Se interpretó "2 sesiones de Pink Glow" como 1 Pink Glow (incluye 2 sesiones). Confirmar con la clínica.',
    componentes: [
      { codigo: 'SRV-002', cantidad: 1 }, { codigo: 'SRV-003', cantidad: 2 },
      { codigo: 'SRV-004', cantidad: 1 }, { codigo: 'SRV-005', cantidad: 3 },
      { codigo: 'SRV-006', cantidad: 2 },
    ],
  },
  ...[
    ['Tratamiento corporal', 1200],
    ['Tratamiento de celulitis', 1200],
    ['Levantamiento de glúteos', 1000],
  ].map(([nombre, monto], i) => ({
    codigo: `PAQ-${String(paquetesDep.length + 3 + i).padStart(3, '0')}`,
    tipo: 'paquete' as const,
    categoria: 'Corporal',
    nombre: String(nombre),
    monto: Number(monto),
    sesiones: 12,
    nota: 'Tecnologías según evaluación (Velox, carboxiterapia, Retraction, INDIBA, Escus). No consumen sesión adicional.',
  })),
  ...[
    ['Mamas', 800], ['Rostro completo', 800], ['Papada', 500], ['Párpados', 400],
  ].map(([nombre, monto], i) => ({
    codigo: `PAQ-${String(paquetesDep.length + 6 + i).padStart(3, '0')}`,
    tipo: 'paquete' as const,
    categoria: 'Drenaje linfático',
    nombre: `Drenaje linfático — ${nombre}`,
    monto: Number(monto),
    sesiones: 10,
    nota: 'INDIBA, Retraction o combinación; registrar tecnología por atención.',
  })),
  ...[
    ['Brazo + espalda', 800], ['Espalda, brazos y abdomen', 1200], ['Brazos', 500],
  ].map(([nombre, monto], i) => ({
    codigo: `PAQ-${String(paquetesDep.length + 10 + i).padStart(3, '0')}`,
    tipo: 'paquete' as const,
    categoria: 'Drenaje corporal',
    nombre: `Drenaje corporal — ${nombre}`,
    monto: Number(monto),
    sesiones: 10,
    nota: 'INDIBA, Retraction o combinación; registrar tecnología por atención.',
  })),
];

export const SEMILLA_CATALOGO: SemillaItem[] = [...faciales, ...indiba, ...depilacion, ...paquetesDep, ...paquetesResto];
export const SEMILLA_TECNOLOGIAS = ['Velox', 'Carboxiterapia', 'Retraction', 'INDIBA', 'Escus'];
export const MOTIVO_INICIAL = MOTIVO;
