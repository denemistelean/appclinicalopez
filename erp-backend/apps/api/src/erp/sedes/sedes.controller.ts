import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { SedesService } from './sedes.service';
import {
  CreateEquipoDto,
  CreateSalaDto,
  CreateSedeDto,
  MantenimientoEquipoDto,
  UpdateEquipoDto,
  UpdateSalaDto,
  UpdateSedeDto,
} from './sedes.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SedesController {
  constructor(private readonly sedesService: SedesService) {}

  @RequirePermissions('SEDES', 'ver_sede')
  @Get('sedes')
  findAll(@Query() query: any) {
    return this.sedesService.findAll(query);
  }

  @RequirePermissions('SEDES', 'ver_sede')
  @Get('sedes/tipos-equipo')
  tiposEquipo() {
    return this.sedesService.listTiposEquipo();
  }

  @RequirePermissions('SEDES', 'ver_sede')
  @Get('sedes/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.sedesService.findOne(id);
  }

  @RequirePermissions('SEDES', 'crear_sede')
  @Post('sedes')
  create(@Body() dto: CreateSedeDto, @Req() req: any) {
    return this.sedesService.create(dto, req.user.userId);
  }

  @RequirePermissions('SEDES', 'actualizar_sede')
  @Patch('sedes/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSedeDto, @Req() req: any) {
    return this.sedesService.update(id, dto, req.user.userId);
  }

  @RequirePermissions('SEDES', 'eliminar_sede')
  @Delete('sedes/:id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.sedesService.remove(id, req.user.userId);
  }

  @RequirePermissions('SEDES', 'ver_sede')
  @Get('sedes/:id/salas')
  listSalas(@Param('id', ParseIntPipe) id: number) {
    return this.sedesService.listSalas(id);
  }

  @RequirePermissions('SEDES', 'crear_sede')
  @Post('sedes/:id/salas')
  createSala(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateSalaDto, @Req() req: any) {
    return this.sedesService.createSala(id, dto, req.user.userId);
  }

  @RequirePermissions('SEDES', 'actualizar_sede')
  @Put('salas/:id')
  updateSala(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSalaDto, @Req() req: any) {
    return this.sedesService.updateSala(id, dto, req.user.userId);
  }

  @RequirePermissions('SEDES', 'eliminar_sede')
  @Delete('salas/:id')
  removeSala(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.sedesService.removeSala(id, req.user.userId);
  }

  @RequirePermissions('SEDES', 'ver_sede')
  @Get('sedes/:id/equipos')
  listEquipos(@Param('id', ParseIntPipe) id: number) {
    return this.sedesService.listEquipos(id);
  }

  @RequirePermissions('SEDES', 'crear_sede')
  @Post('sedes/:id/equipos')
  createEquipo(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateEquipoDto, @Req() req: any) {
    return this.sedesService.createEquipo(id, dto, req.user.userId);
  }

  @RequirePermissions('SEDES', 'actualizar_sede')
  @Put('equipos/:id')
  updateEquipo(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEquipoDto, @Req() req: any) {
    return this.sedesService.updateEquipo(id, dto, req.user.userId);
  }

  @RequirePermissions('SEDES', 'actualizar_sede')
  @Patch('equipos/:id/mantenimiento')
  mantenimiento(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MantenimientoEquipoDto,
    @Req() req: any,
  ) {
    return this.sedesService.mantenimiento(id, dto, req.user.userId);
  }
}
