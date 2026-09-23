import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource) {}

  /**
   * Resumen base del sistema (núcleo sis_*).
   * Ampliar cuando existan módulos de dominio de la clínica.
   */
  async resumen(_idSucursal?: number | null) {
    const [usuarios] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM sis_usuario WHERE estado_registro = 'ACTIVO'`
    );
    const [roles] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM sis_rol WHERE estado_registro = 'ACTIVO'`
    );
    const [modulos] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM sis_modulo WHERE estado_registro = 'ACTIVO'`
    );

    return {
      indicadores: {
        usuarios_activos: Number(usuarios?.total || 0),
        roles: Number(roles?.total || 0),
        modulos: Number(modulos?.total || 0),
      },
      sistema: {
        usuarios_activos: Number(usuarios?.total || 0),
        roles: Number(roles?.total || 0),
        modulos: Number(modulos?.total || 0),
      },
      series: {},
      totales: {
        usuarios_activos: Number(usuarios?.total || 0),
        roles: Number(roles?.total || 0),
        modulos: Number(modulos?.total || 0),
      },
    };
  }
}
