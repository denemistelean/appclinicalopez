import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateProveedorDto {
  @IsString() @IsNotEmpty() razon_social!: string;
  @IsOptional() @IsString() ruc?: string;
  @IsOptional() @IsString() contacto?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() direccion?: string;
  @IsOptional() @IsIn(['ACTIVO', 'INACTIVO']) estado?: string;
}
export class UpdateProveedorDto extends PartialType(CreateProveedorDto) {}

export class CreateInsumoDto {
  @IsOptional() @IsString() @MaxLength(40) codigo?: string;
  @IsString() @IsNotEmpty() @MaxLength(150) nombre!: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() @MaxLength(30) unidad?: string;
  @IsOptional() @IsNumber() @Min(0) stock_minimo?: number;
  @IsOptional() requiere_lote?: boolean;
  @IsOptional() @IsNumber() id_proveedor_preferido?: number;
  @IsOptional() @IsIn(['ACTIVO', 'INACTIVO']) estado?: string;
}
export class UpdateInsumoDto extends PartialType(CreateInsumoDto) {}

export class CreateLoteDto {
  @IsNumber() id_insumo!: number;
  @IsNumber() id_sede!: number;
  @IsOptional() @IsNumber() id_proveedor?: number;
  @IsString() @IsNotEmpty() codigo_lote!: string;
  @IsString() fecha_ingreso!: string;
  @IsOptional() @IsString() fecha_vencimiento?: string;
  @IsNumber() @Min(0) cantidad_inicial!: number;
  @IsOptional() @IsNumber() @Min(0) costo_unitario?: number;
}
export class UpdateLoteDto extends PartialType(CreateLoteDto) {}

export class MovimientoDto {
  @IsNumber() id_insumo!: number;
  @IsOptional() @IsNumber() id_lote?: number;
  @IsNumber() id_sede!: number;
  @IsIn(['INGRESO', 'SALIDA', 'AJUSTE', 'DEVOLUCION']) tipo_movimiento!: string;
  @IsNumber() cantidad!: number;
  @IsOptional() @IsString() motivo?: string;
}

export class TransferenciaDto {
  @IsNumber() id_insumo!: number;
  @IsNumber() id_lote_origen!: number;
  @IsNumber() id_sede_origen!: number;
  @IsNumber() id_sede_destino!: number;
  @IsNumber() @Min(0.01) cantidad!: number;
  @IsOptional() @IsString() observaciones?: string;
}
