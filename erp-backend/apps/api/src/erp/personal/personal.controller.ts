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
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { PersonalService } from './personal.service';
import {
  CreateCertificacionDto,
  CreateCredencialDto,
  CreateExcepcionDto,
  CreatePersonalDto,
  ReplaceHorarioDto,
  SyncSedesDto,
  UpdateCredencialDto,
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
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  createCertificacion(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const dto: CreateCertificacionDto = {
      nombre_certificado: String(body?.nombre_certificado || '').trim(),
      fecha_certificacion: body?.fecha_certificacion || undefined,
      fecha_vencimiento: body?.fecha_vencimiento || undefined,
      observaciones: body?.observaciones || undefined,
    };
    return this.personalService.createCertificacion(id, dto, req.user.userId, file);
  }

  @RequirePermissions('PERSONAL', 'ver_personal')
  @Get(':id/certificaciones/:idCert/archivo')
  async archivoCertificacion(
    @Param('id', ParseIntPipe) id: number,
    @Param('idCert', ParseIntPipe) idCert: number,
    @Res({ passthrough: true }) res: any,
  ): Promise<StreamableFile> {
    const { file, mime, nombre } = await this.personalService.streamCertificacion(id, idCert);
    res.set({
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="${nombre}"`,
    });
    return file;
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
  @Get(':id/credenciales')
  listCredenciales(@Param('id', ParseIntPipe) id: number) {
    return this.personalService.listCredenciales(id);
  }

  @RequirePermissions('PERSONAL', 'crear_personal')
  @Post(':id/credenciales')
  createCredencial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCredencialDto,
    @Req() req: any,
  ) {
    return this.personalService.createCredencial(id, dto, req.user.userId);
  }

  @RequirePermissions('PERSONAL', 'actualizar_personal')
  @Patch(':id/credenciales/:idCred')
  updateCredencial(
    @Param('id', ParseIntPipe) id: number,
    @Param('idCred', ParseIntPipe) idCred: number,
    @Body() dto: UpdateCredencialDto,
    @Req() req: any,
  ) {
    return this.personalService.updateCredencial(id, idCred, dto, req.user.userId);
  }

  @RequirePermissions('PERSONAL', 'eliminar_personal')
  @Delete(':id/credenciales/:idCred')
  removeCredencial(
    @Param('id', ParseIntPipe) id: number,
    @Param('idCred', ParseIntPipe) idCred: number,
    @Req() req: any,
  ) {
    return this.personalService.removeCredencial(id, idCred, req.user.userId);
  }

  @RequirePermissions('PERSONAL', 'ver_personal')
  @Get(':id/disponibilidad')
  disponibilidad(@Param('id', ParseIntPipe) id: number, @Query() query: any) {
    return this.personalService.disponibilidad(id, query);
  }
}
