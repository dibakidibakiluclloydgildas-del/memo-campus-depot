import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { ZodError } from 'zod';

/**
 * Filtre global : toute erreur sort au format { statusCode, code, message }.
 * Aucune fuite de détail interne (stack, requête SQL) vers le client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ id?: string; url?: string; method?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Une erreur interne est survenue. Réessayez dans un instant.';
    let details: unknown;

    if (exception instanceof ZodError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      code = 'VALIDATION_ERROR';
      message = 'Certaines informations sont invalides.';
      details = exception.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        const rawMessage = record.message;
        message = Array.isArray(rawMessage)
          ? rawMessage.join(' ; ')
          : typeof rawMessage === 'string'
            ? rawMessage
            : message;
        code = typeof record.code === 'string' ? record.code : httpCodeName(status);
        if (record.details !== undefined) details = record.details;
      } else {
        code = httpCodeName(status);
      }
      if (code === 'INTERNAL_ERROR') code = httpCodeName(status);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE';
        message = 'Cette valeur existe déjà.';
        details = { fields: exception.meta?.target };
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'Ressource introuvable.';
      } else {
        status = HttpStatus.BAD_REQUEST;
        code = `PRISMA_${exception.code}`;
        message = 'La requête n’a pas pu être traitée.';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'BAD_REQUEST';
      message = 'Requête invalide.';
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status} : ${(exception as Error)?.message ?? exception}`,
        (exception as Error)?.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      requestId: request.id,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

function httpCodeName(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'ERROR';
  }
}
