import { Transform } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** Acepta true/false, 1/0 y "1"/"0" (típico de MySQL / ng-select) */
const toBool = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 1 || value === '1';
};

/** DECIMAL/string de inputs → number; ''/null → null (opcionales) */
const toNum = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
};

export class CreateTratamientoDto {
  @IsOptional() @IsString() @MaxLength(40) codigo?: string;
  @IsString() @IsNotEmpty() @MaxLength(150) nombre!: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() @MaxLength(100) categoria?: string;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  @Min(1)
  id_especialidad?: number | null;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  @Min(1)
  duracion_minutos?: number;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  @Min(0)
  precio_base?: number;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  requiere_equipo?: boolean;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  requiere_sala?: boolean;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  id_tipo_equipo?: number | null;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  @Min(0)
  intervalo_minutos?: number | null;

  @IsOptional() @IsIn(['ACTIVO', 'INACTIVO']) estado?: string;
  @IsOptional() @IsArray() sedes?: number[];
}

export class UpdateTratamientoDto extends PartialType(CreateTratamientoDto) {}

export class TratamientoSedeDto {
  @Transform(toNum)
  @IsNumber()
  id_sede!: number;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  @Min(0)
  precio?: number;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  disponible?: boolean;
}

export class SyncTratamientoSedesDto {
  @IsArray() sedes!: TratamientoSedeDto[];
}

export class CreateContraindicacionDto {
  @IsOptional() @IsString() @MaxLength(60) codigo?: string;
  @IsString() @IsNotEmpty() @MaxLength(255) descripcion!: string;
  @IsOptional() @IsIn(['BAJA', 'MEDIA', 'ALTA', 'ABSOLUTA']) severidad?: string;
}

export class CreateTratamientoInsumoDto {
  @Transform(toNum)
  @IsNumber()
  id_insumo!: number;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  @Min(0.01)
  cantidad?: number;

  @IsOptional() @IsString() @MaxLength(30) unidad?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  obligatorio?: boolean;
}

export class CreatePaqueteDto {
  @IsOptional() @IsString() @MaxLength(40) codigo?: string;
  @IsString() @IsNotEmpty() @MaxLength(150) nombre!: string;
  @IsOptional() @IsString() descripcion?: string;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  id_tratamiento?: number | null;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  @Min(1)
  cantidad_sesiones?: number;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  @Min(0)
  precio_total?: number;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  @Min(1)
  vigencia_dias?: number;

  @IsOptional() @IsIn(['ACTIVO', 'INACTIVO']) estado?: string;
}

export class UpdatePaqueteDto extends PartialType(CreatePaqueteDto) {}
