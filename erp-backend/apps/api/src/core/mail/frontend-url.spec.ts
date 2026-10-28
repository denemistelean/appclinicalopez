import { resolverFrontendUrl } from './frontend-url';

describe('FRONTEND_URL', () => {
  it('en desarrollo usa el puerto del frontend si no hay valor', () => {
    expect(resolverFrontendUrl({ nodeEnv: 'development' })).toBe('http://localhost:4202');
    expect(resolverFrontendUrl({ nodeEnv: '' })).toBe('http://localhost:4202');
    expect(resolverFrontendUrl({ nodeEnv: 'development', configurada: 'http://localhost:4202/' })).toBe(
      'http://localhost:4202',
    );
  });

  it('en producción exige un origen absoluto y rechaza localhost', () => {
    expect(() => resolverFrontendUrl({ nodeEnv: 'production' })).toThrow(/obligatoria/);
    expect(() => resolverFrontendUrl({ nodeEnv: 'production', configurada: 'localhost:4202' })).toThrow(/absoluta/);
    expect(() => resolverFrontendUrl({ nodeEnv: 'production', configurada: 'http://localhost:4202' })).toThrow(
      /local/,
    );
    expect(() => resolverFrontendUrl({ nodeEnv: 'production', configurada: 'http://127.0.0.1:3789' })).toThrow(
      /local/,
    );
    expect(resolverFrontendUrl({ nodeEnv: 'production', configurada: 'https://staging.example/' })).toBe(
      'https://staging.example',
    );
  });
});
