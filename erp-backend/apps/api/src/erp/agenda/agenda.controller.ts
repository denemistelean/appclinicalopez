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
import { AgendaService } from './agenda.service';
import {
  CancelarCitaDto,
  CreateCitaDto,
  ListaEsperaDto,
  PacientePaqueteDto,
  UpdateCitaDto,
} from './agenda.dto';

@Controller('agenda')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgendaController {
  constructor(private readonly service: AgendaService) {}

  @RequirePermissions('AGENDA', 'ver_cita')
  @Get('dia')
  dia(@Query() q: any) {
    return this.service.dia(q);
  }

  @RequirePermissions('AGENDA', 'ver_cita')
  @Get('tipos-cita')
  tiposCita() {
    return this.service.listTiposCita();
  }

  @RequirePermissions('AGENDA', 'ver_cita')
  @Get('roles-recurso')
  roles() {
    return this.service.listRoles();
  }

  @RequirePermissions('AGENDA', 'ver_cita')
  @Get('personal/:id/roles')
  rolesPersonal(@Param('id', ParseIntPipe) id: number) {
    return this.service.rolesDePersonal(id);
  }

  @RequirePermissions('AGENDA', 'actualizar_cita')
  @Post('personal/:id/roles')
  asignarRol(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { id_rol_recurso: number },
    @Req() r: any,
  ) {
    return this.service.asignarRol(id, Number(body.id_rol_recurso), r.user.userId);
  }

  @RequirePermissions('AGENDA', 'actualizar_cita')
  @Delete('personal-roles/:id')
  quitarRol(@Param('id', ParseIntPipe) id: number, @Req() r: any) {
    return this.service.quitarRol(id, r.user.userId);
  }

  @RequirePermissions('AGENDA', 'ver_cita')
  @Get('citas')
  list(@Query() q: any) {
    return this.service.list(q);
  }

  @RequirePermissions('AGENDA', 'ver_cita')
  @Post('citas/validar')
  validar(@Body() d: CreateCitaDto) {
    return this.service.validar(d);
  }

  @RequirePermissions('AGENDA', 'ver_cita')
  @Post('citas/sugerir-horario')
  sugerir(@Body() d: CreateCitaDto) {
    return this.service.sugerirHorario(d);
  }

  @RequirePermissions('AGENDA', 'ver_cita')
  @Get('disponibilidad')
  disp(@Query() q: any) {
    return this.service.disponibilidad(q);
  }

  @RequirePermissions('AGENDA', 'ver_cita')
  @Get('citas/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.service.get(id);
  }

  @RequirePermissions('AGENDA', 'crear_cita')
  @Post('citas')
  create(@Body() d: CreateCitaDto, @Req() r: any) {
    return this.service.create(d, r.user.userId);
  }

  @RequirePermissions('AGENDA', 'actualizar_cita')
  @Patch('citas/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() d: UpdateCitaDto, @Req() r: any) {
    return this.service.update(id, d, r.user.userId);
  }

  @RequirePermissions('AGENDA', 'eliminar_cita')
  @Post('citas/:id/cancelar')
  cancelar(@Param('id', ParseIntPipe) id: number, @Body() d: CancelarCitaDto, @Req() r: any) {
    return this.service.cancelar(id, d, r.user.userId);
  }

  @RequirePermissions('AGENDA', 'actualizar_cita')
  @Post('citas/:id/estado')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { estado: string },
    @Req() r: any,
  ) {
    return this.service.cambiarEstado(id, String(body?.estado || ''), r.user.userId);
  }

  @RequirePermissions('AGENDA', 'actualizar_cita')
  @Post('citas/:id/completar')
  completar(@Param('id', ParseIntPipe) id: number, @Req() r: any) {
    return this.service.completar(id, r.user.userId);
  }

  @RequirePermissions('AGENDA', 'eliminar_cita')
  @Delete('citas/:id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() r: any) {
    return this.service.remove(id, r.user.userId);
  }

  @RequirePermissions('AGENDA', 'ver_cita')
  @Get('lista-espera')
  espera(@Query() q: any) {
    return this.service.listaEspera(q);
  }

  @RequirePermissions('AGENDA', 'crear_cita')
  @Post('lista-espera')
  addEspera(@Body() d: ListaEsperaDto, @Req() r: any) {
    return this.service.addEspera(d, r.user.userId);
  }

  @RequirePermissions('AGENDA', 'ver_cita')
  @Get('pacientes/:id/paquetes')
  paquetes(@Param('id', ParseIntPipe) id: number) {
    return this.service.paquetes(id);
  }

  @RequirePermissions('AGENDA', 'crear_cita')
  @Post('paciente-paquetes')
  addPaquete(@Body() d: PacientePaqueteDto, @Req() r: any) {
    return this.service.addPaquete(d, r.user.userId);
  }
}
