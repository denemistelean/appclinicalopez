import {
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
import { HistoriaClinicaService } from './historia-clinica.service';
import {
  ConsultaDto,
  PlantillaDto,
  UpdateConsultaDto,
  UpdatePlantillaDto,
} from './historia-clinica.dto';

@Controller('historia-clinica')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HistoriaClinicaController {
  constructor(private readonly service: HistoriaClinicaService) {}

  @RequirePermissions('HISTORIA_CLINICA', 'ver_historia_clinica')
  @Get('plantillas')
  plantillas(@Query() q: any) {
    return this.service.plantillas(q);
  }

  @RequirePermissions('HISTORIA_CLINICA', 'crear_historia_clinica')
  @Post('plantillas')
  createP(@Body() d: PlantillaDto, @Req() r: any) {
    return this.service.createPlantilla(d, r.user.userId);
  }

  @RequirePermissions('HISTORIA_CLINICA', 'actualizar_historia_clinica')
  @Patch('plantillas/:id')
  updateP(@Param('id', ParseIntPipe) id: number, @Body() d: UpdatePlantillaDto, @Req() r: any) {
    return this.service.updatePlantilla(id, d, r.user.userId);
  }

  @RequirePermissions('HISTORIA_CLINICA', 'eliminar_historia_clinica')
  @Delete('plantillas/:id')
  removeP(@Param('id', ParseIntPipe) id: number, @Req() r: any) {
    return this.service.removePlantilla(id, r.user.userId);
  }

  @RequirePermissions('HISTORIA_CLINICA', 'ver_historia_clinica')
  @Get('cie10')
  cie(@Query() q: any) {
    return this.service.cie10(q);
  }

  @RequirePermissions('HISTORIA_CLINICA', 'ver_historia_clinica')
  @Get('medicamentos')
  medicamentos(@Query() q: any) {
    return this.service.medicamentos(q);
  }

  @RequirePermissions('HISTORIA_CLINICA', 'ver_historia_clinica')
  @Get('consultas')
  list(@Query() q: any) {
    return this.service.consultas(q);
  }

  @RequirePermissions('HISTORIA_CLINICA', 'ver_historia_clinica')
  @Get('consultas/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.service.getConsulta(id);
  }

  @RequirePermissions('HISTORIA_CLINICA', 'crear_historia_clinica')
  @Post('consultas')
  create(@Body() d: ConsultaDto, @Req() r: any) {
    return this.service.createConsulta(d, r.user.userId);
  }

  @RequirePermissions('HISTORIA_CLINICA', 'actualizar_historia_clinica')
  @Patch('consultas/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() d: UpdateConsultaDto, @Req() r: any) {
    return this.service.updateConsulta(id, d, r.user.userId);
  }

  @RequirePermissions('HISTORIA_CLINICA', 'actualizar_historia_clinica')
  @Post('consultas/:id/finalizar')
  finalizar(@Param('id', ParseIntPipe) id: number, @Req() r: any) {
    return this.service.finalizar(id, r.user.userId);
  }

  @RequirePermissions('HISTORIA_CLINICA', 'eliminar_historia_clinica')
  @Delete('consultas/:id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() r: any) {
    return this.service.removeConsulta(id, r.user.userId);
  }
}
