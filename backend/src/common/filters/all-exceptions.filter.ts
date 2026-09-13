import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Prisma } from '../../generated/prisma'
import { EnableBankingError } from '../../bank-sync/enable-banking.client'
import type { Response } from 'express'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    // NestJS HttpExceptions (BadRequest, NotFound, etc.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const exceptionResponse = exception.getResponse()

      response
        .status(status)
        .json(
          typeof exceptionResponse === 'string'
            ? { statusCode: status, message: exceptionResponse }
            : exceptionResponse
        )
      return
    }

    // Enable Banking refusals keep their upstream reason: the status and
    // body say something the user can act on ("Application is not active"),
    // which an anonymous 500 would bury.
    if (exception instanceof EnableBankingError) {
      const detail = this.enableBankingDetail(exception)
      const hint = /not active/i.test(detail)
        ? ' Activate it from the Enable Banking Control Panel ' +
          '("Activate by linking accounts"), then retry.'
        : ''
      this.logger.warn(`Enable Banking ${exception.status}: ${detail}`)
      response.status(HttpStatus.BAD_GATEWAY).json({
        statusCode: HttpStatus.BAD_GATEWAY,
        message: `Enable Banking refused this request (${exception.status}): ${detail}.${hint}`,
      })
      return
    }

    // Prisma known errors (constraint violations, not found, etc.)
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaResponse = this.handlePrismaError(exception)
      response.status(prismaResponse.statusCode).json(prismaResponse)
      return
    }

    // Everything else → 500
    const message =
      exception instanceof Error ? exception.message : 'Internal server error'

    this.logger.error(
      `Unhandled exception: ${message}`,
      exception instanceof Error ? exception.stack : undefined
    )

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    })
  }

  /** The human sentence in an Enable Banking error body, if there is one. */
  private enableBankingDetail(exception: EnableBankingError): string {
    try {
      const parsed: unknown = JSON.parse(exception.body)
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        'message' in parsed &&
        typeof parsed.message === 'string'
      ) {
        return parsed.message
      }
    } catch {
      // Not JSON — fall through to the raw body.
    }
    return exception.body.slice(0, 200) || exception.message
  }

  private handlePrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    statusCode: number
    message: string
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'A record with this value already exists',
        }
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
        }
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Related record not found',
        }
      default:
        this.logger.error(
          `Prisma error ${exception.code}: ${exception.message}`
        )
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        }
    }
  }
}
