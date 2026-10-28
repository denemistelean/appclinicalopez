import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@app/auth';
import { CatalogoService } from './catalogo.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CatalogoController {
  constructor(private readonly service: CatalogoService) {}

  @RequirePermissions('TRATAMIENTOS', 'ver_tratamiento')
  @Get('catalogo-tarifas')
  listar() {
    return this.service.listar();
  }

  @RequirePermissions('TRATAMIENTOS', 'crear_tratamiento')
  @Post('catalogo-tarifas/items')
  crear(@Body() dto: any, @Req() req: any) {
    return this.service.crearItem(dto, Number(req.user?.userId || 0));
  }

  @RequirePermissions('TRATAMIENTOS', 'actualizar_tratamiento')
  @Patch('catalogo-tarifas/items/:id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.actualizarItem(id, dto);
  }

  @RequirePermissions('TRATAMIENTOS', 'actualizar_tratamiento')
  @Post('catalogo-tarifas/items/:id/precios')
  precio(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req: any) {
    return this.service.nuevoPrecio(id, dto, Number(req.user?.userId || 0));
  }

  @RequirePermissions('TRATAMIENTOS', 'crear_tratamiento')
  @Post('catalogo-tarifas/tecnologias')
  crearTecnologia(@Body() dto: any) {
    return this.service.crearTecnologia(dto);
  }

  @RequirePermissions('TRATAMIENTOS', 'actualizar_tratamiento')
  @Patch('catalogo-tarifas/tecnologias/:id')
  tecnologia(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.actualizarTecnologia(id, dto);
  }
}
