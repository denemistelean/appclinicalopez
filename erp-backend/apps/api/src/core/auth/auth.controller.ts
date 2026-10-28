import { Controller, Post, Body, HttpCode, HttpStatus, Delete, UseGuards, Req, Res, BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CambiarClaveDto } from './dto/cambiar-clave.dto';
import { JwtAuthGuard } from '@app/auth';
import {
  COOKIE_REFRESH,
  borrarCookies,
  exigirCsrf,
  exigirOrigen,
  leerCookie,
  publicarCookies,
} from './cookie-sesion';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    exigirOrigen(req.headers?.origin);
    const resultado = await this.authService.login(loginDto);
    this.entregar(res, resultado);
    return this.publico(resultado);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    exigirOrigen(req.headers?.origin);
    exigirCsrf(req.headers?.cookie, req.headers?.['x-csrf-token']);
    const refresh = leerCookie(req.headers?.cookie, COOKIE_REFRESH);
    if (!refresh) throw new UnauthorizedException('Refresh token inválido o expirado');
    const resultado = await this.authService.refresh(refresh);
    this.entregar(res, resultado);
    return this.publico(resultado);
  }

  @Post('cambiar-clave')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  cambiarClave(@Body() dto: CambiarClaveDto, @Req() req: any) {
    const userId = Number(req.user?.userId || req.user?.sub || 0);
    if (!userId) throw new BadRequestException('Usuario no autenticado');
    return this.authService.cambiarClave(userId, dto.clave_actual, dto.clave_nueva);
  }

  @Delete('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    exigirOrigen(req.headers?.origin);
    borrarCookies(res);
    const userId = Number(req.user?.userId || req.user?.sub || 0);
    return this.authService.logout(userId, req.user?.sid ?? null);
  }

  private entregar(res: Response, resultado: { refresh_token: string; csrf_token: string; access_token: string }): void {
    const parte = resultado.access_token.split('.')[1] || '';
    const payload = JSON.parse(Buffer.from(parte, 'base64url').toString());
    publicarCookies(res, resultado.refresh_token, resultado.csrf_token, Number(payload.session_exp));
  }

  private publico<T extends { refresh_token?: string }>(resultado: T): Omit<T, 'refresh_token'> {
    const { refresh_token, ...resto } = resultado;
    void refresh_token;
    return resto;
  }
}
