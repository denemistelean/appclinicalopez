import { Module } from '@nestjs/common';
import { UnidadesController } from './unidades.controller';

@Module({ controllers: [UnidadesController] })
export class UnidadesModule {}
