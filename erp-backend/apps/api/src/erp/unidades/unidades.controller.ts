import { BadRequestException, Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermissions,
  UnidadScopeService,
} from '@app/auth';
import { AuditoriaService } from '../../common/auditoria/auditoria.service';

@Controller('unidades')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UnidadesController {
  constructor(
    private readonly unidad: UnidadScopeService,
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Get('mias')
  mias(@Req() req: any) {
    return this.unidad.membresiasDe(req.user.userId);
  }

  @RequirePermissions('FACTURACION', 'administrar_configuracion_finanzas')
  @Get('activa/finanzas')
  async finanzasActiva() {
    const id = this.unidad.exigirEmpresa();
    const [row] = await this.db.query(
      `SELECT id_unidad, codigo, nombre, opera_finanzas, requiere_comprobante
       FROM cli_unidad
       WHERE id_unidad = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new BadRequestException('Empresa no encontrada.');
    return {
      id_unidad: Number(row.id_unidad),
      codigo: row.codigo,
      nombre: row.nombre,
      opera_finanzas: !!Number(row.opera_finanzas),
      requiere_comprobante: !!Number(row.requiere_comprobante),
    };
  }

  @RequirePermissions('FACTURACION', 'administrar_configuracion_finanzas')
  @Patch('activa/finanzas')
  async actualizarFinanzas(@Body() dto: any, @Req() req: any) {
    const id = this.unidad.exigirEmpresa();
    if (dto?.requiere_comprobante === undefined) {
      throw new BadRequestException('Indique requiere_comprobante.');
    }
    const valor = dto.requiere_comprobante ? 1 : 0;
    const [antes] = await this.db.query(
      `SELECT id_unidad, requiere_comprobante FROM cli_unidad
       WHERE id_unidad = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!antes) throw new BadRequestException('Empresa no encontrada.');
    await this.db.query(
      `UPDATE cli_unidad SET requiere_comprobante = ?, id_usuario_mod = ? WHERE id_unidad = ?`,
      [valor, Number(req.user?.userId || 0) || null, id],
    );
    await this.auditoria.registrar(
      'cli_unidad',
      id,
      'ACTUALIZAR',
      Number(req.user?.userId || 0),
      { requiere_comprobante: Number(antes.requiere_comprobante) },
      { requiere_comprobante: valor },
    );
    return { ok: true, requiere_comprobante: !!valor };
  }
}
