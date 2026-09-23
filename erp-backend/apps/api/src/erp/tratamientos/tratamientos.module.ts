import { Module } from '@nestjs/common';
import { TratamientosController } from './tratamientos.controller';
import { TratamientosService } from './tratamientos.service';

@Module({ controllers: [TratamientosController], providers: [TratamientosService], exports: [TratamientosService] })
export class TratamientosModule {}
