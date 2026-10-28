import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @RequirePermissions('DASHBOARD', 'ver_dashboard')
  @Get('resumen')
  resumen() {
    return this.dashboardService.resumen();
  }

  @RequirePermissions('DASHBOARD', 'ver_dashboard')
  @Get('citas-semana')
  citasSemana() {
    return this.dashboardService.citasSemanaYPlantillas();
  }

  @RequirePermissions('DASHBOARD', 'ver_dashboard')
  @Post('recordatorio/preview')
  previewRecordatorio(@Body() body: any) {
    return this.dashboardService.previsualizarRecordatorio(body || {});
  }

  @RequirePermissions('DASHBOARD', 'ver_dashboard')
  @Get('plantillas')
  plantillas() {
    return this.dashboardService.listarPlantillas();
  }

  @RequirePermissions('DASHBOARD', 'ver_dashboard')
  @Post('plantillas')
  crearPlantilla(@Body() body: any, @Req() r: any) {
    return this.dashboardService.crearPlantilla(body || {}, Number(r.user?.userId || 0));
  }

  @RequirePermissions('DASHBOARD', 'ver_dashboard')
  @Patch('plantillas/:id')
  actualizarPlantilla(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.dashboardService.actualizarPlantilla(id, body || {});
  }

  @RequirePermissions('DASHBOARD', 'ver_dashboard')
  @Delete('plantillas/:id')
  eliminarPlantilla(@Param('id', ParseIntPipe) id: number) {
    return this.dashboardService.eliminarPlantilla(id);
  }
}
