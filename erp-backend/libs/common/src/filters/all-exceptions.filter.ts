import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

// El decorador @Catch() vacío significa que atrapará ABSOLUTAMENTE TODOS los errores
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 1. Determinamos el código de estado HTTP
    const status = 
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 2. Extraemos el mensaje del error (y data enriquecida si viene en el body)
    let message: any = 'Error interno del servidor';
    let data: any = undefined;

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (exceptionResponse && typeof exceptionResponse === 'object') {
        const er = exceptionResponse as any;
        // Nest ValidationPipe: message es string | string[]
        // App: a veces se lanza BadRequestException({ mensaje, data, steps, ... })
        if (er.mensaje != null) {
          message = er.mensaje;
        } else if (er.message != null) {
          message = Array.isArray(er.message) ? er.message.join('; ') : er.message;
        } else if (er.steps || er.ok === false || er.valida === false) {
          const fail = (er.steps || []).find((s: any) => !s.pass);
          message =
            er.hard?.mensaje ||
            fail?.msg ||
            'La operación no es válida';
        } else {
          message = exception.message;
        }
        // Conservar payload de negocio (p. ej. steps de agenda) para el frontend
        if (er.data != null) data = er.data;
        else if (er.steps || er.ok === false || er.valida === false) data = er;
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      // Errores no HTTP (p. ej. MySQL caído, SP inexistente): log completo para diagnóstico.
      const detail =
        exception.message?.trim() ||
        (exception as any).code ||
        (exception as any).driverError?.message ||
        exception.name ||
        String(exception);
      console.error(`[ERROR NO CONTROLADO] en ${request.url}:`, detail);
      if (exception.stack) console.error(exception.stack);

      const full = `${exception.message || ''} ${(exception as any).driverError?.message || ''}`;
      if (full.includes('ER_DUP_ENTRY')) {
        message = 'El registro que intenta crear ya existe en el sistema.';
      } else if (
        full.includes('ECONNREFUSED') ||
        full.includes("Can't connect") ||
        full.includes('PROTOCOL_CONNECTION_LOST') ||
        (exception as any).code === 'ECONNREFUSED'
      ) {
        message = 'No hay conexión con la base de datos. Verifique que MySQL/MariaDB esté iniciado.';
      }
    } else {
      console.error(`[ERROR NO CONTROLADO] en ${request.url}:`, exception);
    }

    // 3. Estructuramos la respuesta final que SIEMPRE recibirá el Frontend
    const body: Record<string, unknown> = {
      exito: false,
      estado: status,
      mensaje: typeof message === 'string' ? message : String(message),
      ruta: request.url,
      fecha: new Date().toISOString(),
    };
    if (data !== undefined) body.data = data;
    response.status(status).json(body);
  }
}