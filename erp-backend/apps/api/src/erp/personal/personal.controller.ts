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
import { PersonalService } from './personal.service';
import {
  CreateCertificacionDto,
  CreateExcepcionDto,
  CreatePersonalDto,
  ReplaceHorarioDto,
  SyncSedesDto,
  UpdatePersonalDto,
} from './personal.dto';

@Controller('personal')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PersonalController {
  constructor(private readonly personalService: PersonalService) {}

  @RequirePermissions('PERSONAL', 'ver_personal')
  @Get('especialidades')
  listEspecialidades(@Query('search') search?: string) {
    return this.personalService.listEspecialidades(search);
  }

  @RequirePermissions('PERSONAL', 'crear_personal')
  @Post('especialidades')
  createEspecialidad(@Body() body: { nombre: string; codigo?: string }, @Req() req: any) {
    return this.personalService.createEspecialidad(body, req.user.userId);
  }

  @RequirePermissions('PERSONAL', 'ver_personal')
  @Get()
  findAll(@Query() query: any) {
    return this.personalService.findAll(query);
  }

  @RequirePermissions('PERSONAL', 'ver_personal')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.personalService.findOne(id);
  }

  @RequirePermissions('PERSONAL', 'crear_personal')
  @Post()
  create(@Body() dto: CreatePersonalDto, @Req() req: any) {
    return this.personalService.create(dto, req.user.userId);
  }

  @RequirePermissions('PERSONAL', 'actualizar_personal')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePersonalDto, @Req() req: any) {
    return this.personalService.update(id, dto, req.user.userId);
  }

  @RequirePermissions('PERSONAL', 'eliminar_personal')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.personalService.remove(id, req.user.userId);
  }

  @RequirePermissions('PERSONAL', 'actualizar_personal')
  @Put(':id/sedes')
  syncSedes(@Param('id', ParseIntPipe) id: number, @Body() dto: SyncSedesDto, @Req() req: any) {
    return this.personalService.syncSedes(id, dto, req.user.userId);
  }

  @RequirePermissions('PERSONAL', 'ver_personal')
  @Get(':id/horario')
  getHorario(@Param('id', ParseIntPipe) id: number) {
    return this.personalService.getHorario(id);
  }

  @RequirePermissions('PERSONAL', 'actualizar_personal')
  @Put(':id/horario')
  replaceHorario(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceHorarioDto,
    @Req() req: any,
  ) {
    return this.personalService.replaceHorario(id, dto, req.user.userId);
  }

  @RequirePermissions('PERSONAL', 'crear_personal')
  @Post(':id/excepciones')
  createExcepcion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateExcepcionDto,
    @Req() req: any,
  ) {
    return this.personalService.createExcepcion(id, dto, req.user.userId);
  }

  @RequirePermissions('PERSONAL', 'ver_personal')
  @Get(':id/excepciones')
  listExcepciones(@Param('id', ParseIntPipe) id: number) {
    return this.personalService.listExcepciones(id);
  }

  @RequirePermissions('PERSONAL', 'ver_personal')
  @Get(':id/certificaciones')
  listCertificaciones(@Param('id', ParseIntPipe) id: number) {
    return this.personalService.listCertificaciones(id);
  }

  @RequirePermissions('PERSONAL', 'crear_personal')
  @Post(':id/certificaciones')
  createCertificacion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCertificacionDto,
    @Req() req: any,
  ) {
    return this.personalService.createCertificacion(id, dto, req.user.userId);
  }

  @RequirePermissions('PERSONAL', 'eliminar_personal')
  @Delete(':id/certificaciones/:idCert')
  removeCertificacion(
    @Param('id', ParseIntPipe) id: number,
    @Param('idCert', ParseIntPipe) idCert: number,
    @Req() req: any,
  ) {
    return this.personalService.removeCertificacion(id, idCert, req.user.userId);
  }

  @RequirePermissions('PERSONAL', 'ver_personal')
  @Get(':id/disponibilidad')
  disponibilidad(@Param('id', ParseIntPipe) id: number, @Query() query: any) {
    return this.personalService.disponibilidad(id, query);
  }
}
