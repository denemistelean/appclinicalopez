import { Module } from '@nestjs/common';
import { CommonModule } from '@app/common';
import { AgendaModule } from '../agenda/agenda.module';
import { DocumentosModule } from '../documentos/documentos.module';
import { MapaCorporalModule } from '../mapa-corporal/mapa-corporal.module';
import { HistoriaClinicaController } from './historia-clinica.controller';
import { HistoriaClinicaService } from './historia-clinica.service';

@Module({
  imports: [AgendaModule, DocumentosModule, MapaCorporalModule, CommonModule],
  controllers: [HistoriaClinicaController],
  providers: [HistoriaClinicaService],
  exports: [HistoriaClinicaService],
})
export class HistoriaClinicaModule {}
