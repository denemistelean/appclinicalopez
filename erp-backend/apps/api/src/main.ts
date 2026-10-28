process.env.TZ = 'America/Lima';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express'; // 🔥 NUEVO: Para servir archivos estáticos
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { ApiModule } from './api.module';
import { detectarPasajero, resolverEscucha } from './core/http/escucha';
import { afirmarDocumentosDeProduccion } from './core/archivos/documentos-root';
import { opcionesHelmet } from './core/http/helmet-politica';
import { AllExceptionsFilter, TransformInterceptor, resolverUploadsRoot } from '@app/common';
import { UnidadInterceptor } from '@app/auth';
import { winstonConfig } from '@app/logger';
import { WinstonModule } from 'nest-winston';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';
import { origenCors, afirmarCookiesDeProduccion } from './core/auth/cookie-sesion';

async function bootstrap() {
  afirmarCookiesDeProduccion();
  const uploadsRoot = resolverUploadsRoot(__dirname);
  afirmarDocumentosDeProduccion(process.env, process.platform, uploadsRoot);
  const pasajero = detectarPasajero();
  if (pasajero) pasajero.configure({ autoInstall: false });
  const escucha = resolverEscucha(process.env, pasajero);
  // 🔥 Usamos NestExpressApplication para habilitar la exposición de la carpeta 'uploads'
  const app = await NestFactory.create<NestExpressApplication>(ApiModule, {
    logger: WinstonModule.createLogger(winstonConfig),
    bodyParser: false,
  });

  // Capturas PNG base64 del mapa 3D (~1–4 MB c/u)
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ extended: true, limit: '20mb' }));
  
  app.enableShutdownHooks();

  const globalPrefix = process.env.API_PREFIX || 'api';
  app.setGlobalPrefix(globalPrefix);

  // 🔥 AJUSTADO: Helmet bloquea la visualización de imágenes/PDFs externos por defecto. 
  // Esto lo flexibiliza para que el frontend pueda mostrar los archivos del ERP.
  app.use(helmet(opcionesHelmet()));
  
  app.enableCors({
    origin: (origin, callback) => callback(null, origenCors(origin)),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Authorization,Content-Type,X-CSRF-Token,X-Unidad-Id',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new UnidadInterceptor(), new TransformInterceptor());
  app.useGlobalFilters(new DatabaseExceptionFilter(), new AllExceptionsFilter());

  // La carpeta uploads vive junto al package.json, tanto en dist como junto a app.js.
  // No sirve DOCUMENTOS_ROOT.
  app.useStaticAssets(uploadsRoot, {
    prefix: '/uploads/',
  });

  if (escucha.tipo === 'passenger') {
    await app.listen(escucha.socket);
    console.log(`ERP API en Phusion Passenger con prefijo: ${globalPrefix}`);
  } else {
    await app.listen(escucha.port, escucha.host);
    console.log(
      `ERP API corriendo en puerto: ${escucha.port} con prefijo: ${globalPrefix} en host: ${escucha.host}`,
    );
  }
}
bootstrap();