import { detectarPasajero, resolverEscucha, resolverHost, type ControlPasajero } from './escucha';

describe('resolución de HOST', () => {
  it('en desarrollo usa el loopback y respeta un HOST explícito', () => {
    expect(resolverHost({ NODE_ENV: 'development' })).toBe('127.0.0.1');
    expect(resolverHost({})).toBe('127.0.0.1');
    expect(resolverHost({ NODE_ENV: '' })).toBe('127.0.0.1');
    expect(resolverHost({ HOST: '192.168.1.20' })).toBe('192.168.1.20');
  });

  it('en producción exige una interfaz concreta y rechaza los comodines', () => {
    expect(() => resolverHost({ NODE_ENV: 'production' })).toThrow(/HOST es obligatorio/);
    expect(() => resolverHost({ NODE_ENV: 'production', HOST: '' })).toThrow(/HOST es obligatorio/);
    expect(() => resolverHost({ NODE_ENV: 'production', HOST: '0.0.0.0' })).toThrow(/todas las interfaces/);
    expect(() => resolverHost({ NODE_ENV: 'production', HOST: '::' })).toThrow(/todas las interfaces/);
    expect(resolverHost({ NODE_ENV: 'production', HOST: '127.0.0.1' })).toBe('127.0.0.1');
  });

  it('Passenger no abre TCP y una variable de entorno no lo activa', () => {
    const pasajero: ControlPasajero = { configure: () => undefined };
    expect(resolverEscucha({ NODE_ENV: 'production' }, pasajero)).toEqual({
      tipo: 'passenger',
      socket: 'passenger',
    });
    expect(resolverEscucha({ NODE_ENV: 'production', HOST: '0.0.0.0' }, pasajero).tipo).toBe('passenger');
    expect(detectarPasajero({})).toBeNull();
    expect(detectarPasajero({ PASSENGER: '1' })).toBeNull();
  });

  it('sin Passenger el TCP de producción sigue rechazando comodines', () => {
    expect(() => resolverEscucha({ NODE_ENV: 'production' }, null)).toThrow(/HOST es obligatorio/);
    expect(() => resolverEscucha({ NODE_ENV: 'production', HOST: '0.0.0.0' }, null)).toThrow(/todas las interfaces/);
    expect(() => resolverEscucha({ NODE_ENV: 'production', HOST: '::' }, null)).toThrow(/todas las interfaces/);
    expect(resolverEscucha({ NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3789' }, null)).toEqual({
      tipo: 'tcp',
      host: '127.0.0.1',
      port: '3789',
    });
    expect(resolverEscucha({}, null)).toEqual({ tipo: 'tcp', host: '127.0.0.1', port: '3777' });
  });
});
