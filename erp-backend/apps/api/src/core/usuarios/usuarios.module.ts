import { Module } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { SesionService } from '../auth/sesion.service';

@Module({
  controllers: [UsuariosController],
  providers: [UsuariosService, SesionService],
  exports: [UsuariosService, SesionService],
})
export class UsuariosModule {}