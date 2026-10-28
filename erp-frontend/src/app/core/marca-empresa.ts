export interface MarcaEmpresa {
  tema: 'ocean' | 'emerald';
  logo: string;
  alt: string;
  titulo: string;
  subtitulo: string;
}

/** López conserva el celeste del tema Ocean. Sorela usa el verde Emerald. */
export function marcaDeEmpresa(codigo: string | null | undefined): MarcaEmpresa {
  if ((codigo || '').trim().toUpperCase() === 'SORELA') {
    return {
      tema: 'emerald',
      logo: 'assets/img/logo-sorela.png?v=1',
      alt: 'Sorela Medic',
      titulo: 'SORELA MEDIC',
      subtitulo: 'Sorela Medic',
    };
  }
  return {
    tema: 'ocean',
    logo: 'assets/img/logo.png?v=3',
    alt: 'Cirugía Plástica López',
    titulo: 'CIRUGÍA PLÁSTICA LÓPEZ',
    subtitulo: 'Clínica Especializada & Medical Spa',
  };
}
