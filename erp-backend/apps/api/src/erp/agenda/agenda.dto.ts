import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/** Convierte string/number a int; null/'' → null (para opcionales). */
const toIntOrNull = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : value;
};

const toInt = ({ value }: { value: unknown }) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : value;
};

export class ParticipanteCitaDto {
  @Transform(toInt)
  @IsInt()
  @Min(1)
  id_personal!: number;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  id_rol_recurso?: number | null;

  @IsOptional()
  @IsBoolean()
  es_principal?: boolean;
}

export class CreateCitaDto {
  @Transform(toInt)
  @IsInt()
  @Min(1)
  id_sede!: number;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  id_paciente!: number;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  id_tipo_cita!: number;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  id_personal?: number | null;

  /** Obligatorio solo si el tipo de cita requiere tratamiento */
  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  id_tratamiento?: number | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  id_sala?: number | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  id_equipo?: number | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  id_paciente_paquete?: number | null;

  @IsString()
  @IsNotEmpty()
  fecha_cita!: string;

  @IsString()
  @IsNotEmpty()
  hora_inicio!: string;

  @IsOptional()
  @IsString()
  hora_fin?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  precio_acordado?: number;

  @IsOptional()
  @IsBoolean()
  aceptar_contraindicaciones?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipanteCitaDto)
  participantes?: ParticipanteCitaDto[];
}

export class UpdateCitaDto extends PartialType(CreateCitaDto) {}

export class CancelarCitaDto {
  @IsString()
  @IsNotEmpty()
  motivo!: string;
}

export class ListaEsperaDto {
  @Transform(toInt)
  @IsInt()
  id_sede!: number;

  @Transform(toInt)
  @IsInt()
  id_paciente!: number;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  id_tratamiento?: number;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  id_personal_preferido?: number;

  @IsOptional()
  @IsString()
  fecha_preferida?: string;

  @IsOptional()
  @IsIn(['MANANA', 'TARDE', 'NOCHE', 'CUALQUIERA'])
  turno_preferido?: string;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  prioridad?: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class PacientePaqueteDto {
  @Transform(toInt)
  @IsInt()
  id_paciente!: number;

  @Transform(toInt)
  @IsInt()
  id_paquete!: number;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  id_sede?: number;

  @IsString()
  fecha_compra!: string;

  @IsOptional()
  @IsString()
  fecha_vencimiento?: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  sesiones_total!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  precio_pagado?: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class AsignarRolPersonalDto {
  @Transform(toInt)
  @IsInt()
  id_personal!: number;

  @Transform(toInt)
  @IsInt()
  id_rol_recurso!: number;

  @IsOptional()
  @IsString()
  vigente_desde?: string;

  @IsOptional()
  @IsString()
  vigente_hasta?: string;
}
