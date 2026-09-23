import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

const toIntArray = ({ value }: { value: unknown }) => {
  if (value == null || value === '') return undefined;
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
};

export class CreatePersonalDto {
  @IsString() @IsNotEmpty() @MaxLength(30) documento!: string;
  @IsOptional() @IsString() @MaxLength(20) tipo_documento?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) nombres!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) apellidos!: string;
  @IsOptional() @IsString() @MaxLength(120) especialidad?: string;
  /** Una o más especialidades del catálogo cli_especialidad */
  @IsOptional()
  @Transform(toIntArray)
  @IsArray()
  @IsInt({ each: true })
  ids_especialidad?: number[];
  @IsOptional() @IsString() @MaxLength(40) telefono?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsInt() @Min(1) id_sede_principal?: number;
  @IsOptional() @IsInt() @Min(1) id_usuario?: number;
  @IsOptional() @IsIn(['ACTIVO', 'INACTIVO', 'VACACIONES', 'LICENCIA']) estado?: string;
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
  @IsOptional() @IsArray() sedes?: number[];
}

export class UpdatePersonalDto extends PartialType(CreatePersonalDto) {}

export class HorarioItemDto {
  @IsInt() @Min(1) id_sede!: number;
  @IsInt() @Min(0) dia_semana!: number;
  @IsString() @IsNotEmpty() hora_inicio!: string;
  @IsString() @IsNotEmpty() hora_fin!: string;
}

export class ReplaceHorarioDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HorarioItemDto)
  items!: HorarioItemDto[];
}

export class CreateExcepcionDto {
  @IsOptional() @IsInt() @Min(1) id_sede?: number;
  @IsString() @IsNotEmpty() fecha!: string;
  @IsOptional() @IsIn(['DIA_LIBRE', 'HORARIO_ESPECIAL', 'BLOQUEO']) tipo?: string;
  @IsOptional() @IsString() hora_inicio?: string;
  @IsOptional() @IsString() hora_fin?: string;
  @IsOptional() @IsString() @MaxLength(255) motivo?: string;
}

export class CreateCertificacionDto {
  @IsInt() @Min(1) id_tratamiento!: number;
  @IsOptional() @IsString() fecha_certificacion?: string;
  @IsOptional() @IsString() fecha_vencimiento?: string;
  @IsOptional() @IsString() @MaxLength(255) observaciones?: string;
}

export class SyncSedesDto {
  @IsArray() sedes!: number[];
  @IsOptional() @IsInt() @Min(1) id_sede_principal?: number;
  @IsOptional() @IsBoolean() es_principal_flag?: boolean;
}
