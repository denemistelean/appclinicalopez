import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePacienteDto {
  @IsOptional() @IsString() tipo_documento?: string;
  @IsString() @IsNotEmpty() @MaxLength(30) numero_documento!: string;
  @IsString() @IsNotEmpty() nombres!: string;
  @IsString() @IsNotEmpty() apellidos!: string;
  @IsOptional() @IsString() fecha_nacimiento?: string;
  @IsOptional() @IsIn(['M', 'F', 'X', 'NO_ESPECIFICADO']) sexo?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() telefono_alterno?: string;
  /** Número para envío por WhatsApp (wa.me). */
  @IsOptional() @IsString() @MaxLength(40) telefono_whatsapp?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() direccion?: string;
  @IsOptional() @IsString() distrito?: string;
  @IsOptional() @IsString() ciudad?: string;

  // Filiación (opcionales)
  @IsOptional() @IsString() estado_civil?: string;
  @IsOptional() @IsString() educacion?: string;
  @IsOptional() @IsString() ocupacion?: string;
  @IsOptional() @IsString() religion?: string;
  @IsOptional() @IsString() identidad_genero?: string;
  @IsOptional() @IsString() orientacion_sexual?: string;
  @IsOptional() @IsString() idioma?: string;
  @IsOptional() @IsString() como_nos_conocio?: string;
  @IsOptional() @IsString() seguro_salud?: string;
  @IsOptional() @IsString() numero_seguro?: string;
  @IsOptional() @IsString() grupo_sanguineo?: string;

  // Contacto emergencia legacy (compatibilidad)
  @IsOptional() @IsString() contacto_emergencia_nombre?: string;
  @IsOptional() @IsString() contacto_emergencia_telefono?: string;
  @IsOptional() @IsString() contacto_emergencia_parentesco?: string;
  @IsOptional() @IsString() contacto_emergencia_direccion?: string;
  @IsOptional() @IsString() contacto_emergencia_datos?: string;

  @IsOptional() @IsNumber() id_sede_registro?: number;
  @IsOptional() @IsString() observaciones?: string;
  @IsOptional() @IsIn(['ACTIVO', 'INACTIVO']) estado?: string;
}

export class UpdatePacienteDto extends PartialType(CreatePacienteDto) {}

export class FusionarPacienteDto {
  @IsNumber() id_sobreviviente!: number;
  @IsNumber() id_duplicado!: number;
}

export class DocumentoPacienteDto {
  @IsString() tipo_documento!: string;
  @IsString() nombre_archivo!: string;
  @IsString() ruta_archivo!: string;
  @IsOptional() @IsString() mime_type?: string;
  @IsOptional() @IsNumber() tamano_bytes?: number;
  @IsOptional() @IsString() fecha_documento?: string;
  @IsOptional() @IsString() observaciones?: string;
}

export class ContactoEmergenciaDto {
  @IsString() @IsNotEmpty() @MaxLength(150) nombre!: string;
  @IsOptional() @IsString() @MaxLength(80) parentesco?: string;
  @IsOptional() @IsString() @MaxLength(40) telefono?: string;
  @IsOptional() @IsString() @MaxLength(255) direccion?: string;
  @IsOptional() @IsString() @MaxLength(500) datos_adicionales?: string;
}

export class UpdateContactoEmergenciaDto extends PartialType(ContactoEmergenciaDto) {}
