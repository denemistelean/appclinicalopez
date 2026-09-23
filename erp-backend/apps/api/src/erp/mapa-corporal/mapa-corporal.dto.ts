import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

const toNum = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
};

export class MapaMarcadorDto {
  @Transform(toNum) @IsNumber() id_paciente!: number;
  @IsOptional() @Transform(toNum) @IsNumber() id_consulta?: number | null;
  @IsOptional() @Transform(toNum) @IsNumber() id_cita?: number | null;
  @IsString() @IsNotEmpty() @MaxLength(80) zona_codigo!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) zona_label!: string;
  @IsOptional() @IsString() @MaxLength(30) lado?: string;
  @IsString() @IsNotEmpty() @MaxLength(150) procedimiento!: string;
  @IsOptional()
  @IsIn(['PLANIFICADO', 'REALIZADO', 'SEGUIMIENTO'])
  estado?: string;
  @IsOptional() @IsString() fecha_plan?: string;
  @IsOptional() @IsString() @MaxLength(1000) notas?: string;
  @Transform(toNum) @IsNumber() pos_x!: number;
  @Transform(toNum) @IsNumber() pos_y!: number;
  @Transform(toNum) @IsNumber() pos_z!: number;
  @IsOptional()
  @IsIn(['CATALOGO', 'MANUAL'])
  origen?: string;
}

export class UpdateMapaMarcadorDto extends PartialType(MapaMarcadorDto) {}
