import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { TOKEN_USE, TokenUse, UnidadScopeService } from '@app/auth';
import { randomBytes, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsuariosService } from '../usuarios/usuarios.service';
import { LoginDto } from './dto/login.dto';
import { MOTIVO_SESION, SesionService } from './sesion.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly unidad: UnidadScopeService,
    private readonly sesion: SesionService,
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
  ) {}

  /**
   * `roleId` es el rol global legado de sis_usuario. No autoriza la empresa.
   * `sid` identifica la fila de cli_sesion. `session_exp` no se amplía.
   * `jti` solo viaja en el refresh y cambia en cada renovación.
   */
  private buildPayload(
    user: { id_usuario: number; correo: string; id_rol: number },
    tokenUse: TokenUse,
    sessionExp: number,
    sid: string,
    jti?: string,
  ) {
    return {
      sub: user.id_usuario,
      username: user.correo,
      roleId: user.id_rol,
      token_use: tokenUse,
      session_exp: sessionExp,
      sid,
      ...(jti ? { jti } : {}),
    };
  }

  private seconds(raw: string | undefined, fallback: number): number {
    const match = /^(\d+)\s*([smhd])?$/i.exec(String(raw ?? '').trim());
    if (!match) return fallback;
    const amount = Number(match[1]);
    const unit = (match[2] || 's').toLowerCase();
    const mult: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return amount * mult[unit];
  }

  private remaining(sessionExp: number): number {
    return sessionExp - Math.floor(Date.now() / 1000);
  }

  private nuevoJti(): string {
    return randomBytes(16).toString('hex');
  }

  private signAccessToken(payload: Record<string, unknown>, sessionExp: number) {
    const life = this.remaining(sessionExp);
    if (life < 1) throw new UnauthorizedException('Refresh token inválido o expirado');
    const accessTtl = this.seconds(this.config.get<string>('JWT_EXPIRES_IN') || '15m', 15 * 60);
    return this.jwtService.sign(payload, { expiresIn: Math.min(accessTtl, life) });
  }

  private signRefreshToken(payload: Record<string, unknown>, sessionExp: number) {
    const life = this.remaining(sessionExp);
    if (life < 1) throw new UnauthorizedException('Refresh token inválido o expirado');
    return this.jwtService.sign(payload, { expiresIn: life });
  }

  private rechazarRefresh(): never {
    throw new UnauthorizedException('Refresh token inválido o expirado');
  }

  private armarRespuesta(user: any, esPrimeraSesion: boolean, sessionExp: number, sid: string, refreshToken: string) {
    return {
      mensaje: 'Login exitoso',
      access_token: this.signAccessToken(this.buildPayload(user, TOKEN_USE.access, sessionExp, sid), sessionExp),
      refresh_token: refreshToken,
      csrf_token: randomBytes(32).toString('base64url'),
      sessionId: sid,
      primera_sesion: esPrimeraSesion,
      usuario: {
        id_usuario: user.id_usuario,
        nombres: user.nombres,
        apellidos: user.apellidos,
        correo: user.correo,
        username: user.correo,
        id_rol: user.id_rol,
        nombre_rol: user.rol,
        rol: user.rol,
        id_sucursal: user.id_sucursal ?? null,
        sucursal: user.sucursal ?? null,
      },
    };
  }

  private firmarRefresh(user: any, sessionExp: number, sid: string) {
    const jti = this.nuevoJti();
    const token = this.signRefreshToken(this.buildPayload(user, TOKEN_USE.refresh, sessionExp, sid, jti), sessionExp);
    return { token, jti };
  }

  async login(loginDto: LoginDto) {
    const identifier = String(loginDto.correo || loginDto.username || '').trim();
    if (!identifier) {
      throw new UnauthorizedException('Credenciales incorrectas o usuario inactivo');
    }

    const user = await this.usuariosService.findByEmail(identifier);
    if (!user || user.estado_registro !== 'ACTIVO') {
      throw new UnauthorizedException('Credenciales incorrectas o usuario inactivo');
    }

    const passwordValida = await bcrypt.compare(loginDto.password, user.password);
    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const membresias = await this.unidad.membresiasDe(user.id_usuario);
    if (!membresias.length) {
      throw new UnauthorizedException('Credenciales incorrectas o usuario inactivo');
    }

    let esPrimeraSesion = false;
    try {
      esPrimeraSesion = await this.usuariosService.leerYMarcarPrimeraSesion(user.id_usuario);
    } catch (_) {}

    const sessionExp = Math.floor(Date.now() / 1000) + this.seconds(this.config.get<string>('JWT_REFRESH_EXPIRES_IN'), 7 * 86400);
    const sid = randomUUID();
    const { token: refreshToken } = this.firmarRefresh(user, sessionExp, sid);
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await this.sesion.insertar(qr, sid, user.id_usuario, this.sesion.hashRefresh(refreshToken), sessionExp);
      await qr.commitTransaction();
    } catch {
      try { await qr.rollbackTransaction(); } catch { /* la transacción ya estaba cerrada */ }
      throw new UnauthorizedException('Credenciales incorrectas o usuario inactivo');
    } finally {
      await qr.release();
    }

    return this.armarRespuesta(user, esPrimeraSesion, sessionExp, sid, refreshToken);
  }

  async refresh(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken);
    } catch {
      this.rechazarRefresh();
    }

    if (payload?.token_use !== TOKEN_USE.refresh) this.rechazarRefresh();
    if (!payload?.sid || !payload?.jti) this.rechazarRefresh();
    const sessionExp = Number(payload.session_exp);
    if (!Number.isFinite(sessionExp) || this.remaining(sessionExp) < 1) this.rechazarRefresh();

    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let refreshNuevo = '';
    let usuario: any = null;
    let cerrada = false;
    const cerrar = async (confirmar: boolean) => {
      if (cerrada) return;
      cerrada = true;
      if (confirmar) await qr.commitTransaction();
      else await qr.rollbackTransaction();
    };
    try {
      const row = await this.sesion.leerBloqueada(qr, String(payload.sid));
      if (!row || Number(row.id_usuario) !== Number(payload.sub) || row.fecha_revocacion) {
        await cerrar(false);
        this.rechazarRefresh();
      }
      if (!this.sesion.coincide(refreshToken, row.hash_refresh)) {
        // Un segundo envío del mismo refresh, incluso concurrente, cierra solo este dispositivo.
        await this.sesion.revocarEn(qr, String(payload.sid), MOTIVO_SESION.reutilizacion);
        await cerrar(true);
        this.rechazarRefresh();
      }

      let ficha: any;
      try {
        ficha = await this.usuariosService.findOne(Number(payload.sub));
      } catch {
        ficha = null;
      }
      if (!ficha?.data || ficha.data.estado_registro !== 'ACTIVO') {
        await this.sesion.revocarTodasEn(qr, Number(payload.sub), MOTIVO_SESION.usuarioInactivo);
        await cerrar(true);
        this.rechazarRefresh();
      }
      const membresias = await this.unidad.membresiasDe(ficha.data.id_usuario);
      if (!membresias.length) {
        await this.sesion.revocarTodasEn(qr, ficha.data.id_usuario, MOTIVO_SESION.sinMembresia);
        await cerrar(true);
        this.rechazarRefresh();
      }

      usuario = {
        id_usuario: ficha.data.id_usuario,
        correo: ficha.data.correo,
        id_rol: ficha.data.id_rol,
        nombres: ficha.data.nombres,
        apellidos: ficha.data.apellidos,
        rol: ficha.data.nombre_rol || ficha.data.rol,
        id_sucursal: ficha.data.id_sucursal ?? null,
        sucursal: ficha.data.sucursal ?? null,
      };
      refreshNuevo = this.firmarRefresh(usuario, sessionExp, String(payload.sid)).token;
      const cambio = await this.sesion.sustituirHash(qr, String(payload.sid), this.sesion.hashRefresh(refreshNuevo));
      if (!cambio?.affectedRows) {
        await cerrar(false);
        this.rechazarRefresh();
      }
      await cerrar(true);
    } catch (error) {
      try { await cerrar(false); } catch { /* ya confirmada o revertida */ }
      if (error instanceof UnauthorizedException) throw error;
      this.rechazarRefresh();
    } finally {
      await qr.release();
    }

    return this.armarRespuesta(usuario, false, sessionExp, String(payload.sid), refreshNuevo);
  }

  /**
   * Revoca la sesión. Las rutas protegidas dejan de aceptar su access token
   * en la siguiente petición.
   */
  async logout(userId: number, sid?: string | null) {
    if (userId && sid) {
      await this.sesion.revocarUna(sid, userId, MOTIVO_SESION.logout);
    }
    return { mensaje: 'Sesión cerrada' };
  }

  async cambiarClave(userId: number, claveActual: string, claveNueva: string) {
    return this.usuariosService.cambiarClave(userId, claveActual, claveNueva);
  }
}
