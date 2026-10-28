import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';
import * as path from 'path';
import { UnidadScopeService } from '@app/auth';
import { AuditoriaService } from '@app/common';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuthService } from './auth.service';
import { crearMemoriaAuth } from './auth-memoria';
import { SesionService } from './sesion.service';

const SECRET = 'fase2e-unit-secret';

describe('AuthService — sesiones y refresh rotativo', () => {
  let service: AuthService;
  let usuarios: UsuariosService;
  let jwtService: JwtService;
  let memoria: ReturnType<typeof crearMemoriaAuth>;
  let passwordHash = '';
  let estadoUsuario = 'ACTIVO';
  let membresias = [
    { id_unidad: 1, id_rol: 1, opera_finanzas: 0, codigo: 'LOPEZ', nombre: 'López' },
  ];
  const db = {
    query: jest.fn(async (sql: string, params?: any[]) => {
      const sesion = await memoria.query(sql, params || []);
      if (sesion !== null) return sesion;
      if (sql.includes('obtener_por_correo')) {
        if (estadoUsuario === 'AUSENTE') return [[]];
        return [[{ ...fila(), estado_registro: estadoUsuario, password: passwordHash }]];
      }
      if (sql.includes('sis_usuario_obtener')) return [[{ ...fila(), estado_registro: estadoUsuario, nombre_rol: 'SUPERADMIN' }]];
      if (sql.includes('primera_sesion')) return [{ primera_sesion: 0 }];
      if (sql.includes('SELECT id_usuario, password')) return [{ id_usuario: 2, password: passwordHash, estado_registro: 'ACTIVO' }];
      if (sql.includes('UPDATE sis_usuario SET password')) return { affectedRows: 1 };
      if (sql.includes('sis_usuario_eliminar')) {
        estadoUsuario = 'ELIMINADO';
        return { affectedRows: 1 };
      }
      return [];
    }),
    createQueryRunner: () => memoria.createQueryRunner(),
  };

  function fila() {
    return {
      id_usuario: 2,
      correo: 'admin',
      id_rol: 99,
      nombres: 'Super',
      apellidos: 'Admin',
      rol: 'SUPERADMIN',
    };
  }

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('clave-ok', 4);
    memoria = crearMemoriaAuth();
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '15m' } })],
      providers: [
        AuthService,
        SesionService,
        UsuariosService,
        { provide: getDataSourceToken('APP_DB_CONN'), useValue: db },
        { provide: UnidadScopeService, useValue: { membresiasDe: async () => membresias, empresaActiva: () => 1 } },
        { provide: AuditoriaService, useValue: { registrar: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => (key === 'JWT_EXPIRES_IN' ? '15m' : key === 'JWT_REFRESH_EXPIRES_IN' ? '7d' : undefined) },
        },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
    usuarios = moduleRef.get(UsuariosService);
    jwtService = moduleRef.get(JwtService);
  });

  beforeEach(() => {
    memoria.sesiones.clear();
    memoria.estado.fallarInsert = false;
    memoria.estado.commits = 0;
    memoria.estado.rollbacks = 0;
    estadoUsuario = 'ACTIVO';
    membresias = [{ id_unidad: 1, id_rol: 1, opera_finanzas: 0, codigo: 'LOPEZ', nombre: 'López' }];
  });

  async function entrar() {
    const res = await service.login({ correo: 'admin', password: 'clave-ok' });
    const access = jwtService.decode(res.access_token) as any;
    const refresh = jwtService.decode(res.refresh_token) as any;
    return { res, access, refresh };
  }

  it('crea una sesión y firma el access por 15 minutos', async () => {
    const { res, access, refresh } = await entrar();
    expect(memoria.sesiones.size).toBe(1);
    expect(res.sessionId).toBe(access.sid);
    expect(access.token_use).toBe('access');
    expect(access.roleId).toBe(99);
    expect(access.exp - access.iat).toBe(900);
    expect(refresh.token_use).toBe('refresh');
    expect(refresh.jti).toEqual(expect.any(String));
    expect(refresh.session_exp).toBe(access.session_exp);
    const guardado = memoria.sesiones.get(res.sessionId);
    expect(guardado.hash_refresh).not.toBe(res.refresh_token);
    expect(guardado.hash_refresh).toHaveLength(64);
  });

  it('no abre sesión si el usuario está bloqueado o sin membresías', async () => {
    estadoUsuario = 'BLOQUEADO';
    await expect(service.login({ correo: 'admin', password: 'clave-ok' })).rejects.toBeInstanceOf(UnauthorizedException);
    estadoUsuario = 'ACTIVO';
    membresias = [];
    await expect(service.login({ correo: 'admin', password: 'clave-ok' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(memoria.sesiones.size).toBe(0);
  });

  it('rota el refresh con otro jti y sin ampliar session_exp', async () => {
    const primero = await entrar();
    const renovado = await service.refresh(primero.res.refresh_token);
    const siguiente = jwtService.decode(renovado.refresh_token) as any;
    expect(siguiente.jti).not.toBe(primero.refresh.jti);
    expect(siguiente.session_exp).toBe(primero.refresh.session_exp);
    expect(siguiente.exp).toBeLessThanOrEqual(primero.refresh.session_exp);
    await expect(service.refresh(primero.res.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(memoria.sesiones.get(primero.res.sessionId).motivo_revocacion).toBe('REUTILIZACION');
  });

  it('dos refresh simultáneos dejan una sola sesión inválida', async () => {
    const primero = await entrar();
    const token = primero.res.refresh_token;
    const resultados = await Promise.allSettled([service.refresh(token), service.refresh(token)]);
    const ok = resultados.filter((r) => r.status === 'fulfilled');
    const mal = resultados.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(mal).toHaveLength(1);
    const nuevo = (ok[0] as PromiseFulfilledResult<any>).value.refresh_token;
    await expect(service.refresh(nuevo)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(memoria.sesiones.get(primero.res.sessionId).motivo_revocacion).toBe('REUTILIZACION');
  });

  it('si la sesión no se guarda, no entrega tokens', async () => {
    memoria.estado.fallarInsert = true;
    await expect(service.login({ correo: 'admin', password: 'clave-ok' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(memoria.sesiones.size).toBe(0);
    expect(memoria.estado.rollbacks).toBeGreaterThan(0);
  });

  it('logout, cambio de clave y baja revocan según la sesión o el usuario', async () => {
    const a = await entrar();
    const b = await entrar();
    await service.logout(2, a.res.sessionId);
    await expect(service.refresh(a.res.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    const sigue = await service.refresh(b.res.refresh_token);
    expect(sigue.refresh_token).toEqual(expect.any(String));

    await usuarios.cambiarClave(2, 'clave-ok', 'clave-nueva1');
    await expect(service.refresh(sigue.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(memoria.sesiones.get(b.res.sessionId).motivo_revocacion).toBe('CAMBIO_CLAVE');

    const c = await service.login({ correo: 'admin', password: 'clave-ok' });
    await usuarios.remove(2, 9);
    await expect(service.refresh(c.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(memoria.sesiones.get(c.sessionId).motivo_revocacion).toBe('BAJA');
  });

  it('el código no escribe tokens en la consola y el access queda en 15 minutos', () => {
    const backend = fs.readFileSync(path.join(__dirname, 'auth.service.ts'), 'utf8');
    const modulo = fs.readFileSync(path.join(__dirname, '../../../../../libs/auth/src/auth.module.ts'), 'utf8');
    const frontend = fs.readFileSync(
      path.join(__dirname, '../../../../../../erp-frontend/src/app/core/services/auth.service.ts'),
      'utf8',
    );
    expect(backend).not.toMatch(/console\./);
    expect(frontend).not.toMatch(/console\.(log|debug|info|warn)/);
    expect(frontend).not.toMatch(/refresh_token/);
    expect(modulo).toMatch(/15m/);
    const ejemplo = fs.readFileSync(path.join(__dirname, '../../../../../.env.example'), 'utf8');
    expect(ejemplo).toMatch(/JWT_EXPIRES_IN=15m/);
    const legado = jwt.sign({ sub: 2, username: 'admin', roleId: 99 }, SECRET, { expiresIn: '15m' });
    expect((jwt.decode(legado) as any).token_use).toBeUndefined();
  });
});
