import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { MapaCorporalService } from './mapa-corporal.service';
import { MapaMarcadorDto, UpdateMapaMarcadorDto } from './mapa-corporal.dto';

@Controller('mapa-corporal')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MapaCorporalController {
  constructor(private readonly service: MapaCorporalService) {}

  @RequirePermissions('MAPA_CORPORAL', 'ver_mapa_corporal')
  @Get()
  list(@Query() q: any) {
    return this.service.list(q);
  }

  // Capturas 3D del informe: lectura con permiso de paciente
  @RequirePermissions('PACIENTES', 'ver_paciente')
  @Get('paciente/:idPaciente/capturas')
  estadoCapturas(@Param('idPaciente', ParseIntPipe) idPaciente: number) {
    return this.service.estadoCapturas(idPaciente);
  }

  @RequirePermissions('PACIENTES', 'ver_paciente')
  @Get('paciente/:idPaciente/capturas/:vista')
  getCaptura(
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
    @Param('vista') vista: string,
  ) {
    if (vista !== 'frontal' && vista !== 'posterior') {
      throw new BadRequestException('Vista inválida (frontal|posterior)');
    }
    return this.service.getCaptura(idPaciente, vista);
  }

  @RequirePermissions('MAPA_CORPORAL', 'actualizar_mapa_marcador')
  @Post('paciente/:idPaciente/capturas')
  guardarCapturas(
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
    @Body() body: { frontal?: string; posterior?: string },
    @Req() r: any,
  ) {
    return this.service.guardarCapturas(idPaciente, body || {}, r.user.userId);
  }

  @RequirePermissions('MAPA_CORPORAL', 'eliminar_mapa_marcador')
  @Delete('paciente/:idPaciente/capturas')
  eliminarCapturas(@Param('idPaciente', ParseIntPipe) idPaciente: number, @Req() r: any) {
    return this.service.eliminarCapturas(idPaciente, r.user.userId);
  }

  @RequirePermissions('MAPA_CORPORAL', 'ver_mapa_corporal')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @RequirePermissions('MAPA_CORPORAL', 'crear_mapa_marcador')
  @Post()
  create(@Body() d: MapaMarcadorDto, @Req() r: any) {
    return this.service.create(d, r.user.userId);
  }

  @RequirePermissions('MAPA_CORPORAL', 'actualizar_mapa_marcador')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: UpdateMapaMarcadorDto,
    @Req() r: any,
  ) {
    return this.service.update(id, d, r.user.userId);
  }

  @RequirePermissions('MAPA_CORPORAL', 'eliminar_mapa_marcador')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() r: any) {
    return this.service.remove(id, r.user.userId);
  }
}
