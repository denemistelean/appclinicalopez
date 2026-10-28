import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { UnidadScopeService } from '../unidad/unidad-scope.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectDataSource('APP_DB_CONN') private dataSource: DataSource,
    private readonly unidad: UnidadScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<{ modulo: string; accion: string }>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.userId) {
      if (!requiredPermissions) return true;
      throw new ForbiddenException('No se pudo identificar al usuario.');
    }

    const header = request.headers?.['x-unidad-id'];

    // Sin @RequirePermissions (p. ej. GET /unidades/mias): no exigir empresa aún.
    // Si el cliente manda X-Unidad-Id inválido o hay varias membresías sin header,
    // dejamos req.unidad vacío para no bloquear el listado de empresas al login.
    if (!requiredPermissions) {
      try {
        request.unidad = await this.unidad.resolver(user.userId, header);
      } catch {
        request.unidad = undefined;
      }
      return true;
    }

    const activa = await this.unidad.resolver(user.userId, header);
    request.unidad = activa;

    const query = `
      SELECT 1
      FROM sis_permiso p
      INNER JOIN sis_accion a ON p.id_accion = a.id_accion
      INNER JOIN sis_modulo m ON a.id_modulo = m.id_modulo
      WHERE p.id_rol = ?
        AND m.nombre = ?
        AND a.codigo_accion = ?
        AND m.estado_registro = 'ACTIVO'
      LIMIT 1
    `;

    const result = await this.dataSource.query(query, [
      activa.roleId,
      requiredPermissions.modulo,
      requiredPermissions.accion,
    ]);

    if (result.length > 0) return true;
    throw new ForbiddenException(
      `Permiso denegado. Se requiere la acción '${requiredPermissions.accion}' en el módulo '${requiredPermissions.modulo}'.`,
    );
  }
}
