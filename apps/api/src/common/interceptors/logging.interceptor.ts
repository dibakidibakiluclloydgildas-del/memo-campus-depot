import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Journalisation structurée (JSON sur une ligne) : exploitable par un
 * agrégateur de logs sans parsing fragile. Aucune donnée sensible n'est loguée.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { id?: string }>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const entry = {
          requestId: request.id,
          method: request.method,
          path: request.route?.path ?? request.url,
          status: response.statusCode,
          durationMs: Date.now() - startedAt,
          userId: (request as { user?: { id: string } }).user?.id,
        };
        this.logger.log(JSON.stringify(entry));
      }),
    );
  }
}
