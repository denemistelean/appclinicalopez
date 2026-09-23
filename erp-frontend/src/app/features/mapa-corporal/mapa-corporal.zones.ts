export type ZonaAnatomica = {
  id: string;
  label: string;
  xFrac: number;
  yFrac: number;
  side: 'front' | 'back';
};

/** Zonas del prototipo HTML: fracciones sobre el bbox del GLB */
export const ZONAS_ANATOMICAS: ZonaAnatomica[] = [
  { id: 'nariz', label: 'Nariz', xFrac: 0.0, yFrac: 0.94, side: 'front' },
  { id: 'menton', label: 'Mentón', xFrac: 0.0, yFrac: 0.905, side: 'front' },
  { id: 'labios', label: 'Labios', xFrac: 0.0, yFrac: 0.915, side: 'front' },
  { id: 'parpados', label: 'Párpados', xFrac: 0.0, yFrac: 0.955, side: 'front' },
  { id: 'mejilla_izq', label: 'Mejilla izquierda', xFrac: -0.1, yFrac: 0.935, side: 'front' },
  { id: 'mejilla_der', label: 'Mejilla derecha', xFrac: 0.1, yFrac: 0.935, side: 'front' },
  { id: 'nuca', label: 'Nuca', xFrac: 0.0, yFrac: 0.92, side: 'back' },
  { id: 'cuello', label: 'Cuello', xFrac: 0.0, yFrac: 0.87, side: 'front' },
  { id: 'pecho', label: 'Pecho / mamas', xFrac: 0.0, yFrac: 0.74, side: 'front' },
  { id: 'espalda_alta', label: 'Espalda alta', xFrac: 0.0, yFrac: 0.75, side: 'back' },
  { id: 'abdomen', label: 'Abdomen', xFrac: 0.0, yFrac: 0.6, side: 'front' },
  { id: 'espalda_baja', label: 'Espalda baja / flancos', xFrac: 0.0, yFrac: 0.6, side: 'back' },
  { id: 'brazo_izq', label: 'Brazo izquierdo', xFrac: -0.55, yFrac: 0.68, side: 'front' },
  { id: 'brazo_der', label: 'Brazo derecho', xFrac: 0.55, yFrac: 0.68, side: 'front' },
  { id: 'mano_izq', label: 'Mano izquierda', xFrac: -0.9, yFrac: 0.65, side: 'front' },
  { id: 'mano_der', label: 'Mano derecha', xFrac: 0.9, yFrac: 0.65, side: 'front' },
  { id: 'gluteo_izq', label: 'Glúteo izquierdo', xFrac: -0.12, yFrac: 0.48, side: 'back' },
  { id: 'gluteo_der', label: 'Glúteo derecho', xFrac: 0.12, yFrac: 0.48, side: 'back' },
  { id: 'muslo_izq', label: 'Muslo izquierdo', xFrac: -0.13, yFrac: 0.33, side: 'front' },
  { id: 'muslo_der', label: 'Muslo derecho', xFrac: 0.13, yFrac: 0.33, side: 'front' },
  { id: 'rodilla_izq', label: 'Rodilla izquierda', xFrac: -0.12, yFrac: 0.19, side: 'front' },
  { id: 'rodilla_der', label: 'Rodilla derecha', xFrac: 0.12, yFrac: 0.19, side: 'front' },
  { id: 'pierna_izq', label: 'Pierna izquierda', xFrac: -0.12, yFrac: 0.08, side: 'front' },
  { id: 'pierna_der', label: 'Pierna derecha', xFrac: 0.12, yFrac: 0.08, side: 'front' },
];

export const PROCEDIMIENTOS_MAPA = [
  { id: 'Rinoplastia', nombre: 'Rinoplastia' },
  { id: 'Mentoplastia', nombre: 'Mentoplastia' },
  { id: 'Otoplastia', nombre: 'Otoplastia' },
  { id: 'Blefaroplastia', nombre: 'Blefaroplastia' },
  { id: 'Bichectomía', nombre: 'Bichectomía' },
  { id: 'Lifting facial', nombre: 'Lifting facial' },
  { id: 'Aumento de labios', nombre: 'Aumento de labios' },
  { id: 'Liposucción', nombre: 'Liposucción' },
  { id: 'Abdominoplastia', nombre: 'Abdominoplastia' },
  { id: 'Aumento mamario', nombre: 'Aumento mamario' },
  { id: 'Mastopexia', nombre: 'Mastopexia' },
  { id: 'Gluteoplastia (implante)', nombre: 'Gluteoplastia (implante)' },
  { id: 'Lipotransferencia a glúteos (BBL)', nombre: 'Lipotransferencia a glúteos (BBL)' },
  { id: 'Braquioplastia (brazos)', nombre: 'Braquioplastia (brazos)' },
  { id: 'Lifting de muslos', nombre: 'Lifting de muslos' },
  { id: 'Ginecomastia', nombre: 'Ginecomastia' },
  { id: 'Rejuvenecimiento de manos', nombre: 'Rejuvenecimiento de manos' },
  { id: 'Peeling / tratamiento de piel', nombre: 'Peeling / tratamiento de piel' },
  { id: 'Otro (ver notas)', nombre: 'Otro (ver notas)' },
];

export const ESTADOS_MAPA = [
  { id: 'PLANIFICADO', nombre: 'Planificado' },
  { id: 'REALIZADO', nombre: 'Realizado' },
  { id: 'SEGUIMIENTO', nombre: 'En seguimiento' },
];

/** Ruta pública del modelo (Angular assets). Colocar el GLB en src/assets/models/cuerpo.glb */
export const MAPA_GLB_URL = '/assets/models/cuerpo.glb';
