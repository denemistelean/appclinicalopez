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
import { PacientesService } from './pacientes.service';
import {
  ContactoEmergenciaDto,
  CreatePacienteDto,
  DocumentoPacienteDto,
  FusionarPacienteDto,
  UpdateContactoEmergenciaDto,
  UpdatePacienteDto,
} from './pacientes.dto';

@Controller('pacientes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PacientesController {
  constructor(private readonly service: PacientesService) {}

  @RequirePermissions('PACIENTES', 'ver_paciente')
  @Get()
  list(@Query() q: any) {
    return this.service.findAll(q);
  }

  @RequirePermissions('PACIENTES', 'ver_paciente')
  @Get('buscar-duplicados')
  dup(@Query() q: any) {
    return this.service.duplicados(q);
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Post('fusionar')
  fusion(@Body() d: FusionarPacienteDto, @Req() r: any) {
    return this.service.fusionar(d, r.user.userId);
  }

  @RequirePermissions('PACIENTES', 'ver_paciente')
  @Get(':id/resumen')
  resumen(@Param('id', ParseIntPipe) id: number) {
    return this.service.resumen(id);
  }

  @RequirePermissions('PACIENTES', 'ver_paciente')
  @Get(':id/documentos')
  docs(@Param('id', ParseIntPipe) id: number) {
    return this.service.documentos(id);
  }

  @RequirePermissions('PACIENTES', 'crear_paciente')
  @Post(':id/documentos')
  addDoc(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: DocumentoPacienteDto,
    @Req() r: any,
  ) {
    return this.service.addDocumento(id, d, r.user.userId);
  }

  @RequirePermissions('PACIENTES', 'eliminar_paciente')
  @Delete('documentos/:id')
  delDoc(@Param('id', ParseIntPipe) id: number, @Req() r: any) {
    return this.service.removeDocumento(id, r.user.userId);
  }

  @RequirePermissions('PACIENTES', 'ver_paciente')
  @Get(':id/contactos-emergencia')
  listContactos(@Param('id', ParseIntPipe) id: number) {
    return this.service.listContactosEmergencia(id);
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Post(':id/contactos-emergencia')
  addContacto(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: ContactoEmergenciaDto,
    @Req() r: any,
  ) {
    return this.service.addContactoEmergencia(id, d, r.user.userId);
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Patch(':id/contactos-emergencia/:idContacto')
  updateContacto(
    @Param('id', ParseIntPipe) id: number,
    @Param('idContacto', ParseIntPipe) idContacto: number,
    @Body() d: UpdateContactoEmergenciaDto,
    @Req() r: any,
  ) {
    return this.service.updateContactoEmergencia(id, idContacto, d, r.user.userId);
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Delete(':id/contactos-emergencia/:idContacto')
  removeContacto(
    @Param('id', ParseIntPipe) id: number,
    @Param('idContacto', ParseIntPipe) idContacto: number,
    @Req() r: any,
  ) {
    return this.service.removeContactoEmergencia(id, idContacto, r.user.userId);
  }

  @RequirePermissions('PACIENTES', 'ver_paciente')
  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @RequirePermissions('PACIENTES', 'crear_paciente')
  @Post()
  create(@Body() d: CreatePacienteDto, @Req() r: any) {
    return this.service.create(d, r.user.userId);
  }

  @RequirePermissions('PACIENTES', 'actualizar_paciente')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: UpdatePacienteDto,
    @Req() r: any,
  ) {
    return this.service.update(id, d, r.user.userId);
  }

  @RequirePermissions('PACIENTES', 'eliminar_paciente')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() r: any) {
    return this.service.remove(id, r.user.userId);
  }
}
