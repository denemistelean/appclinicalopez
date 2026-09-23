import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../../common/auditoria/auditoria.module';
import { MapaCorporalController } from './mapa-corporal.controller';
import { MapaCorporalService } from './mapa-corporal.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [MapaCorporalController],
  providers: [MapaCorporalService],
  exports: [MapaCorporalService],
})
export class MapaCorporalModule {}
