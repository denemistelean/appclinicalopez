import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

// Importamos el portero y el escáner (usando tus rutas relativas correctas)
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { exigirSecretoJwt } from './jwt-secreto';
import { UnidadScopeService } from './unidad/unidad-scope.service';

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Configuramos la fábrica de tokens (pulseras)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: exigirSecretoJwt(config.get<string>('JWT_SECRET')),
        signOptions: { 
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') || '15m') as any 
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, PermissionsGuard, UnidadScopeService],
  exports: [AuthService, JwtModule, PassportModule, JwtStrategy, JwtAuthGuard, PermissionsGuard, UnidadScopeService],
})
export class AuthModule {}