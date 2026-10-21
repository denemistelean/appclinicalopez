import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

const toBool = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'TRUE') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'FALSE') return false;
  return Boolean(value);
};

export class CreateSedeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsOptional() @IsString() @MaxLength(200) razon_social?: string;
  @IsOptional() @IsString() @MaxLength(255) direccion?: string;
  @IsOptional() @IsString() @MaxLength(100) ciudad?: string;
  @IsOptional() @IsString() @MaxLength(100) distrito?: string;
  @IsOptional() @IsString() @MaxLength(40) telefono?: string;
  @IsOptional() @IsEmail() email_contacto?: string;
  @IsOptional() @IsString() horario_apertura?: string;
  @IsOptional() @IsString() horario_cierre?: string;
  @IsOptional() dias_atencion?: any;
  @IsOptional() @IsString() @MaxLength(255) logo_url?: string;
  @IsOptional() @IsIn(['ACTIVA', 'INACTIVA']) estado?: string;
  /** Permite agendar varias citas en el mismo horario */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  libre_disposicion?: boolean;
}

export class UpdateSedeDto extends PartialType(CreateSedeDto) {}

export class CreateSalaDto {
  @IsString() @IsNotEmpty() @MaxLength(100) nombre!: string;
  @IsOptional() @IsString() @MaxLength(150) capacidad_equipo?: string;
  @IsOptional() @IsIn(['DISPONIBLE', 'OCUPADA', 'MANTENIMIENTO', 'INACTIVA']) estado?: string;
}

export class UpdateSalaDto extends PartialType(CreateSalaDto) {}

export class CreateEquipoDto {
  @IsString() @IsNotEmpty() @MaxLength(120) nombre!: string;
  @IsOptional() id_tipo_equipo?: number;
  @IsOptional() @IsString() @MaxLength(100) tipo?: string;
  @IsOptional() @IsString() @MaxLength(100) numero_serie?: string;
  @IsOptional() @IsString() fecha_adquisicion?: string;
  @IsOptional() @IsIn(['OPERATIVO', 'EN_MANTENIMIENTO', 'DE_BAJA']) estado?: string;
}

export class UpdateEquipoDto extends PartialType(CreateEquipoDto) {}

export class MantenimientoEquipoDto {
  @IsOptional() @IsString() fecha_ultimo_mantenimiento?: string;
  @IsOptional() @IsString() proximo_mantenimiento?: string;
  @IsOptional() @IsIn(['OPERATIVO', 'EN_MANTENIMIENTO', 'DE_BAJA']) estado?: string;
}
