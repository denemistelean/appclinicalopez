import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { exigirSecretoJwt } from '../jwt-secreto';
import { TOKEN_USE } from '../token-claims';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: exigirSecretoJwt(config.get<string>('JWT_SECRET')),
    });
  }

  /**
   * El firmador no emite iss ni aud. El refresh no se acepta como access.
   * Un access sin sid no se puede revocar: se rechaza y hay que autenticarse de nuevo.
   * Cada petición protegida lee cli_sesion. No hay caché: la revocación es inmediata.
   * Si la base no responde, la ruta queda cerrada.
   * roleId es el rol global legado y no autoriza la empresa.
   */
  async validate(payload: any) {
    if (payload?.token_use !== TOKEN_USE.access || !payload?.sid || payload?.sub == null) {
      throw new UnauthorizedException('Token inválido');
    }
    if (payload.session_exp != null && Number(payload.session_exp) <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token inválido');
    }

    let row: any;
    try {
      const rows = await this.db.query(
        `SELECT (s.fecha_revocacion IS NULL) AS vigente,
                (s.vence_en > NOW()) AS no_vencida,
                u.estado_registro
         FROM cli_sesion s
         INNER JOIN sis_usuario u ON u.id_usuario = s.id_usuario
         WHERE s.id_sesion = ? AND s.id_usuario = ?
         LIMIT 1`,
        [String(payload.sid), Number(payload.sub)],
      );
      row = rows?.[0];
    } catch (error) {
      const code = (error as { code?: string })?.code || 'error';
      this.logger.error(`No se pudo validar la sesión (${code})`);
      throw new ServiceUnavailableException('No se pudo verificar la sesión');
    }

    if (!row || !Number(row.vigente) || !Number(row.no_vencida) || row.estado_registro !== 'ACTIVO') {
      throw new UnauthorizedException('Token inválido');
    }

    return {
      userId: payload.sub,
      email: payload.username,
      roleId: payload.roleId,
      sid: payload.sid,
    };
  }
}