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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import type { Response } from 'express';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { DocumentosService } from './documentos.service';
import { TipoDocumentoDto, UpdateDocumentoDto, UpdateTipoDocumentoDto } from './documentos.dto';

const tmpDir = join('D:', 'xampp', 'htdocs', 'appClinicaLopez', 'storage', 'tmp');

@Controller('documentos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentosController {
  constructor(private readonly service: DocumentosService) {}

  @RequirePermissions('DOCUMENTOS', 'ver_documento')
  @Get('tipos')
  listTipos(@Query() q: any) {
    return this.service.listTipos(q);
  }

  @RequirePermissions('DOCUMENTOS', 'gestionar_tipo_documento')
  @Post('tipos')
  createTipo(@Body() d: TipoDocumentoDto, @Req() r: any) {
    return this.service.createTipo(d, r.user.userId);
  }

  @RequirePermissions('DOCUMENTOS', 'gestionar_tipo_documento')
  @Patch('tipos/:id')
  updateTipo(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: UpdateTipoDocumentoDto,
    @Req() r: any,
  ) {
    return this.service.updateTipo(id, d, r.user.userId);
  }

  @RequirePermissions('DOCUMENTOS', 'gestionar_tipo_documento')
  @Delete('tipos/:id')
  removeTipo(@Param('id', ParseIntPipe) id: number, @Req() r: any) {
    return this.service.removeTipo(id, r.user.userId);
  }

  @RequirePermissions('DOCUMENTOS', 'ver_documento')
  @Get('consultas-paciente/:idPaciente')
  consultas(@Param('idPaciente', ParseIntPipe) idPaciente: number, @Query() q: any) {
    return this.service.consultasPaciente(idPaciente, q);
  }

  @RequirePermissions('DOCUMENTOS', 'ver_documento')
  @Get('config/raiz')
  raiz() {
    return { documentos_root: this.service.getRoot() };
  }

  @RequirePermissions('DOCUMENTOS', 'ver_documento')
  @Get()
  list(@Query() q: any) {
    return this.service.list(q);
  }

  @RequirePermissions('DOCUMENTOS', 'ver_documento')
  @Get(':id/archivo')
  async archivo(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, mime, nombre } = await this.service.streamFile(id);
    res.set({
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="${encodeURIComponent(nombre)}"`,
    });
    return file;
  }

  @RequirePermissions('DOCUMENTOS', 'ver_documento')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @RequirePermissions('DOCUMENTOS', 'crear_documento')
  @Post()
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
          cb(null, tmpDir);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File, @Body() body: any, @Req() r: any) {
    return this.service.upload(file, body, r.user.userId);
  }

  @RequirePermissions('DOCUMENTOS', 'actualizar_documento')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: UpdateDocumentoDto,
    @Req() r: any,
  ) {
    return this.service.update(id, d, r.user.userId);
  }

  @RequirePermissions('DOCUMENTOS', 'eliminar_documento')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() r: any) {
    return this.service.remove(id, r.user.userId);
  }
}
