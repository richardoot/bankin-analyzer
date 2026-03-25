import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common'
import { AllExceptionsFilter } from './all-exceptions.filter'

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter
  let mockResponse: {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
  }
  let mockHost: { switchToHttp: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    filter = new AllExceptionsFilter()

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
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
})
