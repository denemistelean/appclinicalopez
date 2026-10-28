import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, Subscription } from 'rxjs';
import { unidadAls } from './unidad-contexto';

@Injectable()
export class UnidadInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    if (!req?.unidad) return next.handle();
    return new Observable((subscriber) => {
      let inner: Subscription | undefined;
      unidadAls.run(req.unidad, () => {
        inner = next.handle().subscribe(subscriber);
      });
      return () => inner?.unsubscribe();
    });
  }
}
