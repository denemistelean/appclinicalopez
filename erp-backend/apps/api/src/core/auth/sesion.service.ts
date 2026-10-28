import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, timingSafeEqual } from 'crypto';
import { DataSource, QueryRunner } from 'typeorm';

export const MOTIVO_SESION = {
  logout: 'LOGOUT',
  reutilizacion: 'REUTILIZACION',
  cambioClave: 'CAMBIO_CLAVE',
  baja: 'BAJA',
  usuarioInactivo: 'USUARIO_INACTIVO',
  sinMembresia: 'SIN_MEMBRESIA',
} as const;

@Injectable()
export class SesionService {
  constructor(@InjectDataSource('APP_DB_CONN') private readonly db: DataSource) {}

  hashRefresh(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  coincide(token: string, hashGuardado: string): boolean {
    const actual = Buffer.from(this.hashRefresh(token), 'hex');
    const guardado = Buffer.from(String(hashGuardado || ''), 'hex');
    if (actual.length === 0 || actual.length !== guardado.length) return false;
    return timingSafeEqual(actual, guardado);
  }

  async insertar(qr: QueryRunner, sid: string, idUsuario: number, hash: string, sessionExp: number) {
    await qr.query(
      `INSERT INTO cli_sesion
        (id_sesion, id_usuario, hash_refresh, fecha_creacion, vence_en, fecha_revocacion, motivo_revocacion, fecha_renovacion)
       VALUES (?,?,?,NOW(),FROM_UNIXTIME(?),NULL,NULL,NULL)`,
      [sid, idUsuario, hash, sessionExp],
    );
  }

  async leerBloqueada(qr: QueryRunner, sid: string) {
    const [row] = await qr.query(
      `SELECT id_sesion, id_usuario, hash_refresh, fecha_revocacion, motivo_revocacion
       FROM cli_sesion WHERE id_sesion=? FOR UPDATE`,
      [sid],
    );
    return row ?? null;
  }

  async sustituirHash(qr: QueryRunner, sid: string, hash: string) {
    return qr.query(
      `UPDATE cli_sesion SET hash_refresh=?, fecha_renovacion=NOW()
       WHERE id_sesion=? AND fecha_revocacion IS NULL`,
      [hash, sid],
    );
  }

  async revocarEn(qr: QueryRunner, sid: string, motivo: string) {
    return qr.query(
      `UPDATE cli_sesion SET fecha_revocacion=NOW(), motivo_revocacion=?
       WHERE id_sesion=? AND fecha_revocacion IS NULL`,
      [motivo, sid],
    );
  }

  async revocarTodasEn(qr: QueryRunner, idUsuario: number, motivo: string) {
    return qr.query(
      `UPDATE cli_sesion SET fecha_revocacion=NOW(), motivo_revocacion=?
       WHERE id_usuario=? AND fecha_revocacion IS NULL`,
      [motivo, idUsuario],
    );
  }

  async revocarUna(sid: string, idUsuario: number, motivo: string) {
    await this.db.query(
      `UPDATE cli_sesion SET fecha_revocacion=NOW(), motivo_revocacion=?
       WHERE id_sesion=? AND id_usuario=? AND fecha_revocacion IS NULL`,
      [motivo, sid, idUsuario],
    );
  }

  async revocarTodas(idUsuario: number, motivo: string) {
    await this.db.query(
      `UPDATE cli_sesion SET fecha_revocacion=NOW(), motivo_revocacion=?
       WHERE id_usuario=? AND fecha_revocacion IS NULL`,
      [motivo, idUsuario],
    );
  }
}
