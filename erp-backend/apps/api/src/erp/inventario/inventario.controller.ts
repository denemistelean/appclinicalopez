import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { InventarioService } from './inventario.service';
import { CreateInsumoDto, CreateLoteDto, CreateProveedorDto, MovimientoDto, TransferenciaDto, UpdateInsumoDto, UpdateLoteDto, UpdateProveedorDto } from './inventario.dto';

@Controller('inventario')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventarioController {
  constructor(private readonly service: InventarioService) {}
  @RequirePermissions('INVENTARIO','ver_inventario') @Get('proveedores') listP(@Query() q:any){return this.service.listProveedores(q);}
  @RequirePermissions('INVENTARIO','crear_inventario') @Post('proveedores') createP(@Body() d:CreateProveedorDto,@Req() r:any){return this.service.createProveedor(d,r.user.userId);}
  @RequirePermissions('INVENTARIO','actualizar_inventario') @Patch('proveedores/:id') updateP(@Param('id',ParseIntPipe) id:number,@Body() d:UpdateProveedorDto,@Req() r:any){return this.service.updateProveedor(id,d,r.user.userId);}
  @RequirePermissions('INVENTARIO','eliminar_inventario') @Delete('proveedores/:id') removeP(@Param('id',ParseIntPipe) id:number,@Req() r:any){return this.service.removeProveedor(id,r.user.userId);}
  @RequirePermissions('INVENTARIO','ver_inventario') @Get('insumos') listI(@Query() q:any){return this.service.listInsumos(q);}
  @RequirePermissions('INVENTARIO','ver_inventario') @Get('insumos/:id') getI(@Param('id',ParseIntPipe) id:number){return this.service.getInsumo(id);}
  @RequirePermissions('INVENTARIO','crear_inventario') @Post('insumos') createI(@Body() d:CreateInsumoDto,@Req() r:any){return this.service.createInsumo(d,r.user.userId);}
  @RequirePermissions('INVENTARIO','actualizar_inventario') @Patch('insumos/:id') updateI(@Param('id',ParseIntPipe) id:number,@Body() d:UpdateInsumoDto,@Req() r:any){return this.service.updateInsumo(id,d,r.user.userId);}
  @RequirePermissions('INVENTARIO','eliminar_inventario') @Delete('insumos/:id') removeI(@Param('id',ParseIntPipe) id:number,@Req() r:any){return this.service.removeInsumo(id,r.user.userId);}
  @RequirePermissions('INVENTARIO','ver_inventario') @Get('lotes') listL(@Query() q:any){return this.service.listLotes(q);}
  @RequirePermissions('INVENTARIO','ver_inventario') @Get('lotes/:id') getL(@Param('id',ParseIntPipe) id:number){return this.service.getLote(id);}
  @RequirePermissions('INVENTARIO','crear_inventario') @Post('lotes') createL(@Body() d:CreateLoteDto,@Req() r:any){return this.service.createLote(d,r.user.userId);}
  @RequirePermissions('INVENTARIO','actualizar_inventario') @Patch('lotes/:id') updateL(@Param('id',ParseIntPipe) id:number,@Body() d:UpdateLoteDto,@Req() r:any){return this.service.updateLote(id,d,r.user.userId);}
  @RequirePermissions('INVENTARIO','eliminar_inventario') @Delete('lotes/:id') removeL(@Param('id',ParseIntPipe) id:number,@Req() r:any){return this.service.removeLote(id,r.user.userId);}
  @RequirePermissions('INVENTARIO','ver_inventario') @Get('movimientos') movimientos(@Query() q:any){return this.service.listMovimientos(q);}
  @RequirePermissions('INVENTARIO','ver_inventario') @Get('movimientos/:id') getMovimiento(@Param('id',ParseIntPipe) id:number){return this.service.getMovimiento(id);}
  @RequirePermissions('INVENTARIO','crear_inventario') @Post('movimientos') movimiento(@Body() d:MovimientoDto,@Req() r:any){return this.service.movimiento(d,r.user.userId);}
  @RequirePermissions('INVENTARIO','actualizar_inventario') @Patch('movimientos/:id') updateMovimiento(@Param('id',ParseIntPipe) id:number,@Body() d:any,@Req() r:any){return this.service.updateMovimiento(id,d,r.user.userId);}
  @RequirePermissions('INVENTARIO','eliminar_inventario') @Delete('movimientos/:id') removeMovimiento(@Param('id',ParseIntPipe) id:number,@Req() r:any){return this.service.removeMovimiento(id,r.user.userId);}
  @RequirePermissions('INVENTARIO','ver_inventario') @Get('alertas') alertas(@Query() q:any){return this.service.alertas(q);}
  @RequirePermissions('INVENTARIO','ver_inventario') @Get('transferencias') transferencias(@Query() q:any){return this.service.listTransferencias(q);}
  @RequirePermissions('INVENTARIO','crear_inventario') @Post('transferencias') transferir(@Body() d:TransferenciaDto,@Req() r:any){return this.service.transferir(d,r.user.userId);}
}
