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

/** What the request-log middleware stamped on this response, if it ran. */
function requestIdOf(response: Response): string | undefined {
  const id: unknown = response.locals?.requestId
  return typeof id === 'string' ? id : undefined
}

/** The shape every error answer takes; what Nest's own exceptions produce. */
interface ErrorBody {
  statusCode: number
  message: string | string[]
  [key: string]: unknown
}

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

      this.answer(
        response,
        typeof exceptionResponse === 'string'
          ? { statusCode: status, message: exceptionResponse }
          : (exceptionResponse as ErrorBody)
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
      this.answer(response, {
        statusCode: HttpStatus.BAD_GATEWAY,
        message: `Enable Banking refused this request (${exception.status}): ${detail}.${hint}`,
      })
      return
    }

    // Prisma known errors (constraint violations, not found, etc.)
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.answer(response, this.handlePrismaError(exception))
      return
    }

    // Everything else → 500
    const message =
      exception instanceof Error ? exception.message : 'Internal server error'

    this.logger.error(
      `Unhandled exception: ${message} [${requestIdOf(response) ?? '-'}]`,
      exception instanceof Error ? exception.stack : undefined
    )

    this.answer(response, {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    })
  }

  /**
   * Send the error, and leave two things behind for the request log line
   * written when the response finishes (common/request-log.ts): the
   * message, so a 4xx is explained without a second line of its own; and,
   * on a 5xx, the request id in the body, so the reference a user reads in
   * a toast is the one to search the logs for.
   */
  private answer(response: Response, body: ErrorBody): void {
    const requestId = requestIdOf(response)
    if (response.locals) {
      response.locals.error = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message
    }
    const payload =
      body.statusCode >= 500 && requestId ? { ...body, requestId } : body
    response.status(body.statusCode).json(payload)
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
      case 'P2028':
        // Interactive transaction expired: everything rolled back, nothing
        // was written. Worth saying so — this surfaced as an anonymous 500
        // when a first bank sync claimed a thousand rows one UPDATE at a time.
        return {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message:
            'The write took too long and was rolled back — nothing was saved. ' +
            'Please retry.',
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
