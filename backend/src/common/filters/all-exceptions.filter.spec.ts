import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common'
import { Prisma } from '../../generated/prisma'
import { EnableBankingError } from '../../bank-sync/enable-banking.client'
import { AllExceptionsFilter } from './all-exceptions.filter'

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter
  let mockResponse: {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
    locals: Record<string, unknown>
  }
  let mockHost: { switchToHttp: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    filter = new AllExceptionsFilter()

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      locals: {},
    }

    mockHost = {
      switchToHttp: vi.fn().mockReturnValue({
        getResponse: () => mockResponse,
      }),
    }
  })

  describe('HttpException handling', () => {
    it('should handle BadRequestException with object response', () => {
      const exception = new BadRequestException('Validation failed')

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(400)
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Validation failed',
        })
      )
    })

    it('should handle NotFoundException', () => {
      const exception = new NotFoundException('Resource not found')

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(404)
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          message: 'Resource not found',
        })
      )
    })

    it('should handle UnauthorizedException', () => {
      const exception = new UnauthorizedException('Invalid token')

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(401)
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: 'Invalid token',
        })
      )
    })

    it('should handle InternalServerErrorException', () => {
      const exception = new InternalServerErrorException('Config missing')

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(500)
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Config missing',
        })
      )
    })

    it('should handle HttpException with string response', () => {
      const exception = new HttpException('Custom error', 422)

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(422)
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 422,
        message: 'Custom error',
      })
    })

    it('should handle HttpException with object response containing extra fields', () => {
      const exception = new HttpException(
        {
          statusCode: 400,
          message: ['field must be a string'],
          error: 'Bad Request',
        },
        400
      )

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(400)
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 400,
        message: ['field must be a string'],
        error: 'Bad Request',
      })
    })
  })

  describe('Non-HttpException handling', () => {
    it('should handle generic Error with 500 status', () => {
      const exception = new Error('Something went wrong')

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR
      )
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Internal server error',
      })
    })

    it('should handle non-Error exceptions (string) with 500 status', () => {
      filter.catch('unexpected string error', mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR
      )
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Internal server error',
      })
    })

    it('should handle null/undefined exceptions with 500 status', () => {
      filter.catch(null, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR
      )
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Internal server error',
      })
    })

    it('should handle TypeError with 500 status', () => {
      const exception = new TypeError('Cannot read properties of undefined')

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR
      )
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Internal server error',
      })
    })

    it('should not leak internal error messages to the client', () => {
      const exception = new Error(
        'Database connection failed: password incorrect'
      )

      filter.catch(exception, mockHost as never)

      // The response should NOT contain the detailed error message
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Internal server error',
      })
    })
  })

  describe('Enable Banking error handling', () => {
    it('answers 502 with the upstream reason, not an anonymous 500', () => {
      // The 500 that hid "Application is not active" behind "Internal server
      // error" on the settings page is exactly what this branch exists for.
      const exception = new EnableBankingError(
        403,
        '{"message":"Application is not active"}',
        'GET /aspsps?country=FR → 403 Forbidden'
      )

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(502)
      const body = mockResponse.json.mock.calls[0][0] as { message: string }
      expect(body.message).toContain('Application is not active')
      expect(body.message).toContain('403')
    })

    it('appends the activation hint when the application is not active', () => {
      const exception = new EnableBankingError(
        403,
        '{"message":"Application is not active"}',
        'GET /aspsps?country=FR → 403 Forbidden'
      )

      filter.catch(exception, mockHost as never)

      const body = mockResponse.json.mock.calls[0][0] as { message: string }
      expect(body.message).toContain('Activate by linking accounts')
    })

    it('falls back to the raw body when it is not JSON', () => {
      const exception = new EnableBankingError(
        503,
        'upstream maintenance',
        'GET /application → 503 Service Unavailable'
      )

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(502)
      const body = mockResponse.json.mock.calls[0][0] as { message: string }
      expect(body.message).toContain('upstream maintenance')
    })
  })

  describe('Prisma error handling', () => {
    it('should handle P2002 (unique constraint) with 409 Conflict', () => {
      const exception = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.0.0' }
      )

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(409)
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 409,
        message: 'A record with this value already exists',
      })
    })

    it('should handle P2025 (record not found) with 404 Not Found', () => {
      const exception = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        { code: 'P2025', clientVersion: '5.0.0' }
      )

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(404)
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 404,
        message: 'Record not found',
      })
    })

    it('should handle P2003 (foreign key constraint) with 400 Bad Request', () => {
      const exception = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        { code: 'P2003', clientVersion: '5.0.0' }
      )

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(400)
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 400,
        message: 'Related record not found',
      })
    })

    it('maps an expired transaction (P2028) to 503 with a clear rollback message', () => {
      const exception = new Prisma.PrismaClientKnownRequestError(
        'Transaction API error: transaction already closed',
        { code: 'P2028', clientVersion: '7.0.0' }
      )

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(503)
      const body = mockResponse.json.mock.calls[0][0] as { message: string }
      expect(body.message).toContain('rolled back')
      expect(body.message).toContain('nothing was saved')
    })

    it('should handle unknown Prisma error code with 500', () => {
      const exception = new Prisma.PrismaClientKnownRequestError(
        'Unknown error',
        { code: 'P9999', clientVersion: '5.0.0' }
      )

      filter.catch(exception, mockHost as never)

      expect(mockResponse.status).toHaveBeenCalledWith(500)
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Internal server error',
      })
    })
  })
})

describe('AllExceptionsFilter — what it leaves for the request log', () => {
  function run(
    exception: unknown,
    locals: Record<string, unknown> | undefined = {}
  ): {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
    locals: Record<string, unknown> | undefined
  } {
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      locals,
    }
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    }
    new AllExceptionsFilter().catch(exception, host as never)
    return response
  }

  it('records the message a 4xx was answered with', () => {
    const response = run(new UnauthorizedException('No token provided'))
    expect(response.locals?.error).toBe('No token provided')
  })

  it('joins a validation list into one message', () => {
    const response = run(
      new BadRequestException(['date must be a string', 'amount is required'])
    )
    expect(response.locals?.error).toBe(
      'date must be a string, amount is required'
    )
  })

  it('puts the request id in a 500 body, and only there', () => {
    const boom = run(new Error('boom'), { requestId: 'cdg1::abc' })
    expect(boom.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
      requestId: 'cdg1::abc',
    })

    const missing = run(new NotFoundException('nope'), {
      requestId: 'cdg1::abc',
    })
    expect(missing.json).toHaveBeenCalledWith(
      expect.not.objectContaining({ requestId: expect.anything() })
    )
  })

  it('answers without a request id when no middleware stamped one', () => {
    const response = run(new Error('boom'))
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    })
  })

  it('survives a response without locals', () => {
    const response = run(new Error('boom'), undefined)
    expect(response.status).toHaveBeenCalledWith(500)
  })
})
