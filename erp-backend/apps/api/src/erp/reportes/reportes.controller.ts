import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { ReportesService } from './reportes.service';
import { ReporteFiltroDto } from './reportes.dto';

@Controller('reportes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportesController {
  constructor(private readonly s: ReportesService) {}

  @RequirePermissions('REPORTES', 'ver_reporte')
  @Get('resumen')
  resumen(@Query() q: ReporteFiltroDto) {
    return this.s.resumen(q);
  }

  @RequirePermissions('REPORTES', 'ver_reporte')
  @Get('pacientes')
  pacientes(@Query() q: any) {
    return this.s.pacientes(q);
  }

  @RequirePermissions('REPORTES', 'ver_reporte')
  @Get('sorela')
  sorela(@Query() q: any) {
    return this.s.sorela(String(q.tipo || 'resumen'), q);
  }

  @RequirePermissions('REPORTES', 'ver_reporte')
  @Get('sorela/:tipo')
  sorelaTipo(@Param('tipo') tipo: string, @Query() q: any) {
    return this.s.sorela(tipo, q);
  }

  /** Informe integral por paciente (lectura vía permiso de paciente). */
  @RequirePermissions('PACIENTES', 'ver_paciente')
  @Get('paciente/:id')
  informePaciente(@Param('id', ParseIntPipe) id: number) {
    return this.s.informePaciente(id);
  }
}
