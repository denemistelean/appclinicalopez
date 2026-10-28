import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { HistoriaDigitalService } from './historia-digital.service';

@Controller('historia-digital')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HistoriaDigitalController {
  constructor(private readonly service: HistoriaDigitalService) {}

  @RequirePermissions('PACIENTES', 'ver_paciente')
  @Get('pacientes/:id')
  ficha(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.ficha(id, Number(req.user?.userId || 0));
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Patch('pacientes/:id')
  guardar(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.guardar(id, dto, Number(req.user?.userId || 0));
  }

  @RequirePermissions('PACIENTES', 'ver_paciente')
  @Post('reniec')
  reniec(@Body() dto: any) {
    return this.service.consultarReniec(dto?.numero_documento);
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Post('pacientes/:id/evaluaciones')
  evaluacion(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.crearEvaluacion(id, dto, Number(req.user?.userId || 0));
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Delete('evaluaciones/:id')
  quitarEvaluacion(@Param('id', ParseIntPipe) id: number) {
    return this.service.eliminarEvaluacion(id);
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Post('pacientes/:id/cirugias')
  cirugia(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.crearCirugia(id, dto, Number(req.user?.userId || 0));
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Delete('cirugias/:id')
  quitarCirugia(@Param('id', ParseIntPipe) id: number) {
    return this.service.eliminarCirugia(id);
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Post('pacientes/:id/paquetes')
  paquete(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.crearPaquete(id, dto, Number(req.user?.userId || 0));
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Post('paquetes/:id/baja')
  bajarPlan(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.bajarPlan(id, dto, Number(req.user?.userId || 0));
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Post('paquetes/:id/sesion')
  sesion(@Param('id', ParseIntPipe) id: number) {
    return this.service.usarSesion(id);
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Post('paquetes/:id/programar')
  programarPaquete(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.programarDesdePaquete(id, dto, Number(req.user?.userId || 0));
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Post('pacientes/:id/pagos')
  pago(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.crearPago(id, dto, Number(req.user?.userId || 0));
  }

  /** Lectura para el aviso en agenda; AGENDA.ver_cita (no ver_paciente). */
  @RequirePermissions('AGENDA', 'ver_cita')
  @Get('pacientes/:id/sesiones-pendientes')
  sesionesPendientes(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.sesionesPendientesPaciente(id, Number(req.user?.userId || 0));
  }

  @RequirePermissions('FACTURACION', 'ajustar_pago')
  @Patch('pagos/:id')
  ajustarPago(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.ajustarPago(id, dto, Number(req.user?.userId || 0));
  }

  @RequirePermissions('FACTURACION', 'ajustar_pago')
  @Post('pagos/:id/anular')
  anularPago(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.anularPagoPlan(id, dto, Number(req.user?.userId || 0));
  }

  @RequirePermissions('PACIENTES', 'ver_paciente')
  @Get('citas/:id')
  atencion(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.atencionDeCita(id, Number(req.user?.userId || 0));
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Patch('citas/:id')
  guardarAtencion(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.guardarAtencion(id, dto, Number(req.user?.userId || 0));
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Post('citas/:id/programar')
  programar(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.programarSesion(id, dto, Number(req.user?.userId || 0));
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Post('citas/:id/finalizar')
  finalizarAtencion(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.finalizarAtencion(id, dto, Number(req.user?.userId || 0));
  }

  @RequirePermissions('PACIENTES', 'restituir_sesion')
  @Post('atenciones/:id/restituir')
  restituir(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.restituirSesion(id, dto, Number(req.user?.userId || 0));
  }
}
