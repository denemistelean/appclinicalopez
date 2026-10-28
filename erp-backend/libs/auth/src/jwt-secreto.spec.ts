import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';
import * as path from 'path';
import { exigirSecretoJwt } from './jwt-secreto';
import { JwtStrategy } from './strategies/jwt.strategy';

const VALIDO = 'fase2e12-sintetico-valido-aaaaaaaa';
const EJEMPLO = 'clinica_lopez_cambiar_este_secreto_largo';
const SID = '11111111-1111-4111-8111-111111111111';

function configCon(secreto: unknown): ConfigService {
  return { get: (clave: string) => (clave === 'JWT_SECRET' ? secreto : undefined) } as ConfigService;
}

describe('exigirSecretoJwt', () => {
  it('rechaza un secreto ausente, vacío o corto', () => {
    for (const valor of [undefined, null, '', '   ', 'emergencia', 'a'.repeat(31)]) {
      expect(() => exigirSecretoJwt(valor)).toThrow(/^JWT_SECRET no es válido/);
    }
  });

  it('rechaza el ejemplo publicado sin incluirlo en el error', () => {
    expect(() => exigirSecretoJwt(EJEMPLO)).toThrow(/^JWT_SECRET no es válido/);
    try {
      exigirSecretoJwt(EJEMPLO);
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(EJEMPLO);
      expect(String((error as Error).message)).not.toContain('emergencia');
    }
  });

  it('rechaza el marcador de .env.example', () => {
    const ejemplo = fs.readFileSync(path.resolve(__dirname, '../../../.env.example'), 'utf8');
    const marcador = ejemplo.match(/^JWT_SECRET=(.*)$/m)?.[1] ?? '';
    expect(() => exigirSecretoJwt(marcador)).toThrow(/^JWT_SECRET no es válido/);
  });

  it('acepta un secreto sintético válido', () => {
    expect(exigirSecretoJwt(VALIDO)).toBe(VALIDO);
  });

  it('la estrategia no arranca con un secreto inválido y sí con uno válido', () => {
    expect(() => new JwtStrategy(configCon(undefined), {} as never)).toThrow(/^JWT_SECRET no es válido/);
    expect(() => new JwtStrategy(configCon(EJEMPLO), {} as never)).toThrow(/^JWT_SECRET no es válido/);
    expect(() => new JwtStrategy(configCon(VALIDO), {} as never)).not.toThrow();
  });

  it('no acepta un JWT firmado con el secreto antiguo', () => {
    const token = jwt.sign(
      { sub: 1, username: 'sintetico', roleId: 1, token_use: 'access', sid: SID, session_exp: Math.floor(Date.now() / 1000) + 600 },
      EJEMPLO,
      { expiresIn: '5m' },
    );
    expect(() => jwt.verify(token, exigirSecretoJwt(VALIDO))).toThrow();
  });

  it('sigue rechazando un token malformado o expirado', () => {
    expect(() => jwt.verify('aaa.bbb.ccc', VALIDO)).toThrow();
    const vencido = jwt.sign({ sub: 1, token_use: 'access', sid: SID }, VALIDO, { expiresIn: -10 });
    expect(() => jwt.verify(vencido, VALIDO)).toThrow();
  });
});
