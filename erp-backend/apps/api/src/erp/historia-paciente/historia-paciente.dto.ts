import { IsObject, IsOptional } from 'class-validator';
export class HistoriaItemDto { @IsObject() datos!:Record<string,any>; }
export class UpdateHistoriaItemDto { @IsOptional() @IsObject() datos?:Record<string,any>; }
