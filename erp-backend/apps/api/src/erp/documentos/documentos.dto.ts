import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const toNum = ({ value }: { value: unknown }) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
};

const toBool = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return value;
};

export class TipoDocumentoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  codigo!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  extensiones?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  activo?: boolean;
}

export class UpdateTipoDocumentoDto extends PartialType(TipoDocumentoDto) {}

export class UpdateDocumentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titulo?: string;

  @IsOptional()
  @IsDateString()
  fecha_documento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;

  @IsOptional()
  @Transform(toNum)
  @IsNumber()
  id_tipo_documento?: number;
}
