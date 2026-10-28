import { IsInt, IsNotEmpty, IsOptional, IsString, IsEmail, MinLength, ValidateIf } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';

export class CreateUsuarioDto {
  @IsInt()
  @IsNotEmpty()
  id_rol!: number;

  @IsString()
  @IsNotEmpty()
  nombres!: string;

  @IsString()
  @IsNotEmpty()
  apellidos!: string;

  @IsEmail({}, { message: 'Correo inválido' })
  @IsNotEmpty()
  correo!: string;

  @IsString()
  @MinLength(6, { message: 'Mínimo 6 caracteres' })
  @IsNotEmpty()
  password!: string;

  /** Vínculo opcional a cosmiatra/personal (scope de agenda). */
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @Type(() => Number)
  @IsInt()
  id_personal?: number | null;
}

export class UpdateUsuarioDto extends PartialType(CreateUsuarioDto) {}
