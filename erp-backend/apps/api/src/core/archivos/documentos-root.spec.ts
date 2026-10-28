import { afirmarDocumentosDeProduccion, resolverDocumentosRoot } from './documentos-root';

describe('DOCUMENTOS_ROOT', () => {
  const linux = { nodeEnv: 'production', plataforma: 'linux' as const };

  it('en Linux de producción exige una ruta absoluta fuera de la web pública', () => {
    expect(() => resolverDocumentosRoot(linux)).toThrow(/obligatorio/);
    expect(() => resolverDocumentosRoot({ ...linux, configurada: 'D:\\datos\\expedientes' })).toThrow(/Windows/);
    expect(() => resolverDocumentosRoot({ ...linux, configurada: 'storage/ClinicaDigital' })).toThrow(/absoluta/);
    expect(() =>
      resolverDocumentosRoot({ ...linux, configurada: '/home/cuenta/public_html/expedientes' }),
    ).toThrow(/público/);
    expect(resolverDocumentosRoot({ ...linux, configurada: '/home/cuenta/private/expedientes' })).toBe(
      '/home/cuenta/private/expedientes',
    );
  });

  it('en desarrollo conserva el respaldo local y no inventa una ruta de servidor', () => {
    expect(resolverDocumentosRoot({ nodeEnv: 'development', respaldo: 'D:\\local\\ClinicaDigital' })).toBe(
      'D:\\local\\ClinicaDigital',
    );
    expect(
      resolverDocumentosRoot({
        nodeEnv: '',
        configurada: 'D:\\otro',
        respaldo: 'D:\\local\\ClinicaDigital',
      }),
    ).toBe('D:\\otro');
    expect(() => afirmarDocumentosDeProduccion({ NODE_ENV: 'development' }, 'linux')).not.toThrow();
    expect(() => afirmarDocumentosDeProduccion({ NODE_ENV: 'production' }, 'win32')).toThrow(/obligatorio/);
  });

  it('en producción la ruta no sigue al bundle ni entra en uploads o en la web pública', () => {
    const linux = { nodeEnv: 'production', plataforma: 'linux' as const };
    const privada = '/home/cuenta/private/expedientes';
    expect(resolverDocumentosRoot({ ...linux, configurada: privada })).toBe(privada);
    expect(resolverDocumentosRoot({ ...linux, configurada: privada })).toBe(privada);
    expect(() =>
      resolverDocumentosRoot({
        ...linux,
        configurada: '/var/app/uploads/expedientes',
        uploadsRoot: '/var/app/uploads',
      }),
    ).toThrow(/uploads/);
    expect(() =>
      resolverDocumentosRoot({ ...linux, configurada: '/var/htdocs/expedientes' }),
    ).toThrow(/público/);
    expect(
      resolverDocumentosRoot({
        nodeEnv: 'production',
        plataforma: 'win32',
        configurada: 'D:\\datos\\expedientes',
      }),
    ).toBe('D:\\datos\\expedientes');
    expect(() =>
      resolverDocumentosRoot({
        nodeEnv: 'production',
        plataforma: 'win32',
        configurada: 'D:\\xampp\\htdocs\\storage',
      }),
    ).toThrow(/público/);
  });
});