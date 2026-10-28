import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { unidadAls } from '@app/auth';
import { anotarUnidadEnPayload } from './auditoria-payload';

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);
  /** Cache: true si existe sis_auditoria.id_unidad (patch 041). */
  private columnaIdUnidad: boolean | null = null;

  constructor(@InjectDataSource('APP_DB_CONN') private readonly db: DataSource) {}

  async registrar(
    nombreTabla: string,
    idRegistro: number,
    accion: 'CREAR' | 'ACTUALIZAR' | 'ELIMINAR' | 'ANULAR',
    idUsuario: number,
    valoresAntiguos: any = null,
    valoresNuevos: any = null,
  ) {
    try {
      const idUnidad = unidadAls.getStore()?.idUnidad ?? null;
      const antiguos = anotarUnidadEnPayload(valoresAntiguos, idUnidad);
      const nuevos = anotarUnidadEnPayload(valoresNuevos, idUnidad);
      const jsonAntiguos = antiguos != null ? JSON.stringify(antiguos) : null;
      const jsonNuevos = nuevos != null ? JSON.stringify(nuevos) : null;
      const conUnidad = await this.tieneColumnaIdUnidad();
      if (conUnidad) {
        await this.db.query(
          `INSERT INTO sis_auditoria
            (nombre_tabla, id_registro, accion, id_usuario, id_unidad, valores_antiguos, valores_nuevos)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [nombreTabla, idRegistro, accion, idUsuario, idUnidad, jsonAntiguos, jsonNuevos],
        );
      } else {
        await this.db.query(
          `INSERT INTO sis_auditoria
            (nombre_tabla, id_registro, accion, id_usuario, valores_antiguos, valores_nuevos)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [nombreTabla, idRegistro, accion, idUsuario, jsonAntiguos, jsonNuevos],
        );
      }
      this.logger.log(`✅ Auditoría guardada con éxito: ${accion} en ${nombreTabla}`);
    } catch (error) {
      this.logger.error(
        `❌ Error al intentar guardar auditoría en ${nombreTabla} (ID: ${idRegistro})`,
        error?.stack,
      );
    }
  }

  private async tieneColumnaIdUnidad(): Promise<boolean> {
    if (this.columnaIdUnidad != null) return this.columnaIdUnidad;
    try {
      const [row] = await this.db.query(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'sis_auditoria'
           AND COLUMN_NAME = 'id_unidad'`,
      );
      this.columnaIdUnidad = Number(row?.n || 0) > 0;
    } catch {
      this.columnaIdUnidad = false;
    }
    return this.columnaIdUnidad;
  }
}
