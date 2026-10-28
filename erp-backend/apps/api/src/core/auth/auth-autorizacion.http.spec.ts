import { Controller, Get, INestApplication, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { AuditoriaService } from '@app/common';
import { JwtAuthGuard, JwtStrategy, PermissionsGuard, RequirePermissions, UnidadScopeService } from '@app/auth';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { crearMemoriaAuth } from './auth-memoria';
import { SesionService } from './sesion.service';
import { UsuariosService } from '../usuarios/usuarios.service';

/**
 * HTTP con JWT real y base simulada. No abre app_clinica_lopez ni la base `test`.
 */

const SECRET = 'fase2e12-http-sintetico-valido-aaaa';

@Controller('probe')
@UseGuards(JwtAuthGuard, PermissionsGuard)
class ProbeController {
  @RequirePermissions('AGENDA', 'ver_agenda')
  @Get()
  ok(@Req() req: any) {
    return {
      roleIdToken: req.user.roleId,
      roleIdEmpresa: req.unidad.roleId,
      idUnidad: req.unidad.idUnidad,
    };
  }
}

describe('Fase 2E-2 — HTTP de sesiones (base simulada)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let memoria: ReturnType<typeof crearMemoriaAuth>;
  let passwordHash = '';
  const estado = {
    registro: 'ACTIVO' as string,
    existe: true,
    membresias: [
      { id_unidad: 1, id_rol: 1, opera_finanzas: 0, codigo: 'LOPEZ', nombre: 'López' },
      { id_unidad: 2, id_rol: 4, opera_finanzas: 1, codigo: 'SORELA', nombre: 'Sorela' },
    ],
    rolesConsultados: [] as number[],
    fallarDb: false,
  };

  function filaUsuario() {
    return {
      id_usuario: 1,
      correo: 'admin',
      password: passwordHash,
      id_rol: 99,
      nombres: 'Super',
      apellidos: 'Admin',
      rol: 'SUPERADMIN',
      nombre_rol: 'SUPERADMIN',
      estado_registro: estado.registro,
    };
  }

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('clave-ok', 4);
    memoria = crearMemoriaAuth();
    const db = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        if (sql.includes('FROM cli_sesion') && sql.includes('sis_usuario')) {
          if (estado.fallarDb) {
            const error = new Error('connect ECONNREFUSED') as Error & { code?: string };
            error.code = 'ECONNREFUSED';
            throw error;
          }
          const row = memoria.sesiones.get(String(params[0]));
          if (!row || Number(row.id_usuario) !== Number(params[1])) return [];
          return [{
            vigente: row.fecha_revocacion ? 0 : 1,
            no_vencida: Number(row.vence_unix) > Math.floor(Date.now() / 1000) ? 1 : 0,
            estado_registro: estado.registro,
          }];
        }
        const sesion = await memoria.query(sql, params);
        if (sesion !== null) return sesion;
        if (sql.includes('SELECT id_usuario, password')) {
          return [{ id_usuario: 1, password: passwordHash, estado_registro: estado.registro }];
        }
        if (sql.includes('UPDATE sis_usuario SET password') || sql.includes('sis_auditoria')) return { affectedRows: 1 };
        if (sql.includes('obtener_por_correo')) {
          if (!estado.existe) return [[]];
          return [[filaUsuario()]];
        }
        if (sql.includes('sis_usuario_obtener')) {
          if (estado.registro === 'ELIMINADO') return [[]];
          return [[filaUsuario()]];
        }
        if (sql.includes('primera_sesion')) return [{ primera_sesion: 0 }];
        if (sql.includes('cli_usuario_unidad')) return estado.membresias;
        if (sql.includes('sis_permiso')) {
          estado.rolesConsultados.push(Number(params[0]));
          return [{ ok: 1 }];
        }
        return [];
      }),
      createQueryRunner: () => memoria.createQueryRunner(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '15m' } }),
      ],
      controllers: [AuthController, ProbeController],
      providers: [
        AuthService,
        SesionService,
        UsuariosService,
        UnidadScopeService,
        PermissionsGuard,
        JwtStrategy,
        Reflector,
        { provide: getDataSourceToken('APP_DB_CONN'), useValue: db },
        { provide: AuditoriaService, useValue: { registrar: jest.fn(), registrarConTransaccion: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'JWT_SECRET') return SECRET;
              if (key === 'JWT_EXPIRES_IN') return '15m';
              if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    jwtService = moduleRef.get(JwtService);
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    estado.registro = 'ACTIVO';
    estado.existe = true;
    estado.membresias = [
      { id_unidad: 1, id_rol: 1, opera_finanzas: 0, codigo: 'LOPEZ', nombre: 'López' },
      { id_unidad: 2, id_rol: 4, opera_finanzas: 1, codigo: 'SORELA', nombre: 'Sorela' },
    ];
    estado.rolesConsultados = [];
    estado.fallarDb = false;
    memoria.sesiones.clear();
  });

const ORIGEN = 'http://localhost:4202';

function lineasCookie(res: request.Response): string[] {
  const raw = res.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function valorCookie(res: request.Response, nombre: string): string {
  const linea = lineasCookie(res).find((item) => item.startsWith(`${nombre}=`));
  if (!linea) return '';
  return decodeURIComponent(linea.slice(nombre.length + 1).split(';')[0]);
}

async function entrar() {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .set('Origin', ORIGEN)
    .send({ correo: 'admin', password: 'clave-ok' });
  expect(res.status).toBe(200);
  return {
    access_token: res.body.access_token as string,
    sessionId: res.body.sessionId as string,
    csrf: valorCookie(res, 'cli_csrf'),
    refresh: valorCookie(res, 'cli_refresh'),
    res,
  };
}

function postRefresh(sesion: { refresh: string; csrf: string }, origen = ORIGEN) {
  return request(app.getHttpServer())
    .post('/auth/refresh')
    .set('Origin', origen)
    .set('Cookie', `cli_refresh=${sesion.refresh}; cli_csrf=${sesion.csrf}`)
    .set('X-CSRF-Token', sesion.csrf);
}

  it('un mismo token recibe el rol de cada empresa y no el rol global', async () => {
    const body = await entrar();
    const access = jwtService.decode(body.access_token) as any;
    expect(access.token_use).toBe('access');
    expect(access.roleId).toBe(99);

    const lopez = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${body.access_token}`)
      .set('x-unidad-id', '1');
    expect(lopez.status).toBe(200);
    expect(lopez.body).toEqual({ roleIdToken: 99, roleIdEmpresa: 1, idUnidad: 1 });

    const sorela = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${body.access_token}`)
      .set('x-unidad-id', '2');
    expect(sorela.status).toBe(200);
    expect(sorela.body).toEqual({ roleIdToken: 99, roleIdEmpresa: 4, idUnidad: 2 });
    expect(estado.rolesConsultados).toEqual([1, 4]);
  });

  it('el refresh token no abre una ruta protegida y el access no renueva', async () => {
    const body = await entrar();
    const comoAccess = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${body.refresh}`)
      .set('x-unidad-id', '1');
    expect(comoAccess.status).toBe(401);

    const comoRefresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGEN)
      .set('Cookie', `cli_csrf=${body.csrf}`)
      .set('X-CSRF-Token', body.csrf)
      .send({ refreshToken: body.access_token, sessionId: '1' });
    expect(comoRefresh.status).toBe(401);
    expect(JSON.stringify(comoRefresh.body)).not.toMatch(/access_token|eyJ/);
  });

  it('un access sin sid se rechaza y no renueva', async () => {
    const antiguo = jwt.sign({ sub: 1, username: 'admin', roleId: 99 }, SECRET, { expiresIn: '1h' });
    const ruta = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${antiguo}`)
      .set('x-unidad-id', '2');
    expect(ruta.status).toBe(401);

    const renovar = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGEN)
      .set('Cookie', `cli_refresh=${antiguo}; cli_csrf=csrf-prueba`)
      .set('X-CSRF-Token', 'csrf-prueba');
    expect(renovar.status).toBe(401);
  });

  it('login inactivo o sin membresía no entrega tokens', async () => {
    estado.registro = 'BLOQUEADO';
    const bloqueado = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGEN)
      .send({ correo: 'admin', password: 'clave-ok' });
    expect(bloqueado.status).toBe(401);
    expect(bloqueado.body.access_token).toBeUndefined();

    estado.registro = 'ACTIVO';
    estado.membresias = [];
    const sinEmpresa = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGEN)
      .send({ correo: 'admin', password: 'clave-ok' });
    expect(sinEmpresa.status).toBe(401);
    expect(JSON.stringify(sinEmpresa.body)).not.toMatch(/access_token|refresh_token|eyJ/);
  });

  it('logout revoca el refresh y el access deja de entrar', async () => {
    const body = await entrar();
    const baja = await request(app.getHttpServer())
      .delete('/auth/logout')
      .set('Origin', ORIGEN)
      .set('Authorization', `Bearer ${body.access_token}`);
    expect(baja.status).toBe(200);
    expect(baja.body).toEqual({ mensaje: 'Sesión cerrada' });
    const borrada = lineasCookie(baja).find((item) => item.startsWith('cli_refresh='));
    expect(borrada).toBeTruthy();
    expect(borrada).not.toMatch(/eyJ/);
    expect(borrada).toMatch(/Path=\/api\/auth\/refresh/);

    const probe = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${body.access_token}`)
      .set('x-unidad-id', '1');
    expect(probe.status).toBe(401);

    const renovar = await postRefresh(body);
    expect(renovar.status).toBe(401);
    expect(JSON.stringify(renovar.body)).not.toMatch(/access_token|eyJ/);

    const otraVez = await request(app.getHttpServer())
      .delete('/auth/logout')
      .set('Authorization', `Bearer ${body.access_token}`);
    expect(otraVez.status).toBe(401);
  });

  it('cambia la clave, da de baja, rechaza sesión ajena o vencida y cierra si la base falla', async () => {
    const clave = await entrar();
    const cambio = await request(app.getHttpServer())
      .post('/auth/cambiar-clave')
      .set('Authorization', `Bearer ${clave.access_token}`)
      .send({ clave_actual: 'clave-ok', clave_nueva: 'clave-nueva1' });
    expect(cambio.status).toBe(200);
    const trasClave = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${clave.access_token}`)
      .set('x-unidad-id', '1');
    expect(trasClave.status).toBe(401);

    const baja = await entrar();
    estado.registro = 'ELIMINADO';
    const trasBaja = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${baja.access_token}`)
      .set('x-unidad-id', '1');
    expect(trasBaja.status).toBe(401);

    estado.registro = 'ACTIVO';
    const fantasma = jwt.sign(
      { sub: 1, username: 'admin', roleId: 99, token_use: 'access', sid: 'no-existe', session_exp: Math.floor(Date.now() / 1000) + 3600 },
      SECRET,
      { expiresIn: '15m' },
    );
    const ausente = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${fantasma}`)
      .set('x-unidad-id', '1');
    expect(ausente.status).toBe(401);

    const viva = await entrar();
    memoria.sesiones.get(viva.sessionId).vence_unix = 1;
    const vencida = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${viva.access_token}`)
      .set('x-unidad-id', '1');
    expect(vencida.status).toBe(401);

    estado.fallarDb = true;
    const otra = await entrar();
    const caida = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${otra.access_token}`)
      .set('x-unidad-id', '1');
    expect(caida.status).toBe(503);
    expect(JSON.stringify(caida.body)).not.toMatch(/eyJ|ECONNREFUSED/);
  });

  it('cerrar una sesión no revoca la otra, y quitar una empresa no cierra la que queda', async () => {
    const primera = await entrar();
    const segunda = await entrar();
    await request(app.getHttpServer())
      .delete('/auth/logout')
      .set('Origin', ORIGEN)
      .set('Authorization', `Bearer ${primera.access_token}`);
    const accessMuerto = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${primera.access_token}`)
      .set('x-unidad-id', '1');
    expect(accessMuerto.status).toBe(401);
    const accessVivo = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${segunda.access_token}`)
      .set('x-unidad-id', '2');
    expect(accessVivo.status).toBe(200);

    const muerta = await postRefresh(primera);
    expect(muerta.status).toBe(401);

    const viva = await postRefresh(segunda);
    expect(viva.status).toBe(200);
    const accessViva = viva.body.access_token as string;

    estado.membresias = estado.membresias.filter((m) => m.id_unidad === 2);
    const ajena = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${accessViva}`)
      .set('x-unidad-id', '1');
    expect(ajena.status).toBe(403);
    const propia = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${accessViva}`)
      .set('x-unidad-id', '2');
    expect(propia.status).toBe(200);
    expect(propia.body.roleIdEmpresa).toBe(4);
  });

  it('emite la cookie HttpOnly, rota sin ampliar el vencimiento y exige CSRF', async () => {
    const body = await entrar();
    const linea = lineasCookie(body.res).find((item) => item.startsWith('cli_refresh=')) || '';
    const csrf = lineasCookie(body.res).find((item) => item.startsWith('cli_csrf=')) || '';
    expect(linea).toMatch(/HttpOnly/);
    expect(linea).toMatch(/Path=\/api\/auth\/refresh/);
    expect(linea).toMatch(/SameSite=Lax/i);
    expect(linea).not.toMatch(/\bSecure\b/);
    expect(csrf).not.toMatch(/HttpOnly/);
    const maxAge = Number((/Max-Age=(\d+)/.exec(linea) || [])[1]);
    expect(maxAge).toBeGreaterThan(600000);
    expect(maxAge).toBeLessThanOrEqual(604800);
    expect(body.res.body.refresh_token).toBeUndefined();
    expect(JSON.stringify(body.res.body)).not.toContain(body.refresh);
    expect(body.res.body.csrf_token).toBe(body.csrf);

    const sinDefensa = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGEN)
      .set('Cookie', `cli_refresh=${body.refresh}; cli_csrf=${body.csrf}`);
    expect(sinDefensa.status).toBe(403);

    const csrfMalo = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGEN)
      .set('Cookie', `cli_refresh=${body.refresh}; cli_csrf=${body.csrf}`)
      .set('X-CSRF-Token', 'otro-valor-distinto');
    expect(csrfMalo.status).toBe(403);

    const origenMalo = await postRefresh(body, 'https://evil.example');
    expect(origenMalo.status).toBe(403);

    const renovada = await postRefresh(body);
    expect(renovada.status).toBe(200);
    expect(renovada.body.refresh_token).toBeUndefined();
    const nuevo = valorCookie(renovada, 'cli_refresh');
    expect(nuevo).not.toBe(body.refresh);
    expect(JSON.stringify(renovada.body)).not.toContain(nuevo);
    const antes = jwt.decode(body.refresh) as { session_exp: number; jti: string };
    const despues = jwt.decode(nuevo) as { session_exp: number; jti: string };
    expect(despues.session_exp).toBe(antes.session_exp);
    expect(despues.jti).not.toBe(antes.jti);

    const reutilizado = await postRefresh(body);
    expect(reutilizado.status).toBe(401);
  });

  it('una cookie ausente, vencida o de otro usuario no renueva ni altera la sesión', async () => {
    const body = await entrar();
    const ausente = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGEN)
      .set('Cookie', `cli_csrf=${body.csrf}`)
      .set('X-CSRF-Token', body.csrf);
    expect(ausente.status).toBe(401);

    const caduco = jwt.sign(
      {
        sub: 1,
        username: 'admin',
        roleId: 99,
        token_use: 'refresh',
        sid: body.sessionId,
        jti: 'caduco',
        session_exp: Math.floor(Date.now() / 1000) - 30,
      },
      SECRET,
      { expiresIn: '5m' },
    );
    const vencido = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGEN)
      .set('Cookie', `cli_refresh=${caduco}; cli_csrf=${body.csrf}`)
      .set('X-CSRF-Token', body.csrf);
    expect(vencido.status).toBe(401);

    const ajeno = jwt.sign(
      {
        sub: 99,
        username: 'otro',
        roleId: 1,
        token_use: 'refresh',
        sid: body.sessionId,
        jti: 'ajeno',
        session_exp: Math.floor(Date.now() / 1000) + 3600,
      },
      SECRET,
      { expiresIn: '5m' },
    );
    const otro = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGEN)
      .set('Cookie', `cli_refresh=${ajeno}; cli_csrf=${body.csrf}`)
      .set('X-CSRF-Token', body.csrf);
    expect(otro.status).toBe(401);

    const sigue = await postRefresh(body);
    expect(sigue.status).toBe(200);
    expect(jwt.decode(valorCookie(sigue, 'cli_refresh'))).toMatchObject({ sid: body.sessionId });
  });
});
