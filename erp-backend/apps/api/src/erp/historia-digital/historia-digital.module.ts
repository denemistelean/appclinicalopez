import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { HistoriaDigitalController } from './historia-digital.controller';
import { HistoriaDigitalService } from './historia-digital.service';

@Module({
  imports: [AgendaModule],
  controllers: [HistoriaDigitalController],
  providers: [HistoriaDigitalService],
})
export class HistoriaDigitalModule {}
