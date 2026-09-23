import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

const toNum = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
};

export class PlantillaDto {
  @IsString() @IsNotEmpty() nombre!: string;
  @IsOptional() @IsString() especialidad?: string;
  @IsOptional() @Transform(toNum) @IsNumber() id_tratamiento?: number;
  @IsOptional() estructura_json?: any;
  @IsOptional() activa?: boolean;
}
export class UpdatePlantillaDto extends PartialType(PlantillaDto) {}

export class DiagnosticoItemDto {
  @IsOptional() @Transform(toNum) @IsNumber() id_cie10?: number | null;
  @IsOptional() @Transform(toNum) @IsNumber() id_cie10_subcategoria?: number | null;
  @IsOptional() @IsString() codigo_cie10?: string;
  @IsString() @IsNotEmpty() descripcion!: string;
  @IsOptional()
  @IsIn(['PRESUNTIVO', 'DEFINITIVO', 'RECURRENTE', 'PRINCIPAL', 'SECUNDARIO'])
  tipo?: string;
}

export class MedicamentoItemDto {
  @IsOptional() @Transform(toNum) @IsNumber() id_medicamento?: number;
  @IsString() @IsNotEmpty() medicamento!: string;
  @IsOptional() @IsString() dosis?: string;
  @IsOptional() @IsString() via?: string;
  @IsOptional() @IsString() frecuencia?: string;
  @IsOptional() @IsString() duracion?: string;
  @IsOptional() @IsString() indicaciones?: string;
  @IsOptional() @Transform(toNum) @IsNumber() orden?: number;
}

export class PlanDto {
  @IsOptional() @IsString() indicaciones_generales?: string;
  @IsOptional() @IsString() observaciones?: string;
  @IsOptional() @IsArray() tratamientos?: any[];
  @IsOptional() @IsArray() examenes?: any[];
  @IsOptional() @IsArray() imagenes?: any[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicamentoItemDto)
  medicamentos?: MedicamentoItemDto[];
}

export class ConsultaDto {
  @Transform(toNum) @IsNumber() id_paciente!: number;
  @Transform(toNum) @IsNumber() id_sede!: number;
  @Transform(toNum) @IsNumber() id_personal!: number;
  @IsOptional() @Transform(toNum) @IsNumber() id_cita?: number;
  @IsOptional() @Transform(toNum) @IsNumber() id_plantilla_clinica?: number;
  @IsString() fecha_consulta!: string;
  @IsString() @IsNotEmpty() motivo_consulta!: string;
  @IsOptional() @IsString() tiempo_enfermedad?: string;
  @IsOptional() @IsString() tipo_enfermedad?: string;
  @IsOptional() @IsString() relato?: string;
  @IsOptional() @IsString() anamnesis?: string;
  @IsOptional() @IsString() examen_fisico?: string;
  @IsOptional() @IsString() apreciacion?: string;
  @IsOptional() @IsObject() examen_json?: any;
  @IsOptional() @IsObject() datos_plantilla_json?: any;
  @IsOptional() adjuntos_json?: any;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiagnosticoItemDto)
  diagnosticos?: DiagnosticoItemDto[];
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanDto)
  plan?: PlanDto;
}
export class UpdateConsultaDto extends PartialType(ConsultaDto) {}
