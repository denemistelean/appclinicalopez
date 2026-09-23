import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { TratamientosService } from './tratamientos.service';
import { CreateContraindicacionDto, CreatePaqueteDto, CreateTratamientoDto, CreateTratamientoInsumoDto, SyncTratamientoSedesDto, UpdatePaqueteDto, UpdateTratamientoDto } from './tratamientos.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TratamientosController {
  constructor(private readonly service: TratamientosService) {}

  @RequirePermissions('TRATAMIENTOS', 'ver_tratamiento') @Get('tratamientos')
  findAll(@Query() q: any) { return this.service.findAll(q); }
  @RequirePermissions('TRATAMIENTOS', 'ver_tratamiento') @Get('tratamientos/:id/reglas')
  reglas(@Param('id', ParseIntPipe) id: number) { return this.service.getReglas(id); }
  @RequirePermissions('TRATAMIENTOS', 'ver_tratamiento') @Get('tratamientos/:id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @RequirePermissions('TRATAMIENTOS', 'crear_tratamiento') @Post('tratamientos')
  create(@Body() dto: CreateTratamientoDto, @Req() req: any) { return this.service.create(dto, req.user.userId); }
  @RequirePermissions('TRATAMIENTOS', 'actualizar_tratamiento') @Patch('tratamientos/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTratamientoDto, @Req() req: any) { return this.service.update(id, dto, req.user.userId); }
  @RequirePermissions('TRATAMIENTOS', 'eliminar_tratamiento') @Delete('tratamientos/:id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) { return this.service.remove(id, req.user.userId); }
  @RequirePermissions('TRATAMIENTOS', 'actualizar_tratamiento') @Put('tratamientos/:id/sedes')
  sedes(@Param('id', ParseIntPipe) id: number, @Body() dto: SyncTratamientoSedesDto, @Req() req: any) { return this.service.syncSedes(id, dto.sedes, req.user.userId); }

  @RequirePermissions('TRATAMIENTOS', 'ver_tratamiento') @Get('tratamientos/:id/contraindicaciones')
  contraindicaciones(@Param('id', ParseIntPipe) id: number) { return this.service.listContraindicaciones(id); }
  @RequirePermissions('TRATAMIENTOS', 'crear_tratamiento') @Post('tratamientos/:id/contraindicaciones')
  createContra(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateContraindicacionDto, @Req() req: any) { return this.service.createContraindicacion(id, dto, req.user.userId); }
  @RequirePermissions('TRATAMIENTOS', 'eliminar_tratamiento') @Delete('contraindicaciones/:id')
  removeContra(@Param('id', ParseIntPipe) id: number, @Req() req: any) { return this.service.removeContraindicacion(id, req.user.userId); }

  @RequirePermissions('TRATAMIENTOS', 'ver_tratamiento') @Get('tratamientos/:id/insumos')
  insumos(@Param('id', ParseIntPipe) id: number) { return this.service.listInsumos(id); }
  @RequirePermissions('TRATAMIENTOS', 'crear_tratamiento') @Post('tratamientos/:id/insumos')
  createInsumo(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateTratamientoInsumoDto, @Req() req: any) { return this.service.createInsumo(id, dto, req.user.userId); }
  @RequirePermissions('TRATAMIENTOS', 'eliminar_tratamiento') @Delete('tratamiento-insumos/:id')
  removeInsumo(@Param('id', ParseIntPipe) id: number, @Req() req: any) { return this.service.removeInsumo(id, req.user.userId); }

  @RequirePermissions('TRATAMIENTOS', 'ver_tratamiento') @Get('paquetes')
  paquetes(@Query() q: any) { return this.service.listPaquetes(q); }
  @RequirePermissions('TRATAMIENTOS', 'crear_tratamiento') @Post('paquetes')
  createPaquete(@Body() dto: CreatePaqueteDto, @Req() req: any) { return this.service.createPaquete(dto, req.user.userId); }
  @RequirePermissions('TRATAMIENTOS', 'actualizar_tratamiento') @Patch('paquetes/:id')
  updatePaquete(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePaqueteDto, @Req() req: any) { return this.service.updatePaquete(id, dto, req.user.userId); }
  @RequirePermissions('TRATAMIENTOS', 'eliminar_tratamiento') @Delete('paquetes/:id')
  removePaquete(@Param('id', ParseIntPipe) id: number, @Req() req: any) { return this.service.removePaquete(id, req.user.userId); }
}
