import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'

describe('Users (e2e)', () => {
  let app: INestApplication
  let prismaService: PrismaService

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    prismaService = moduleFixture.get<PrismaService>(PrismaService)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Clean up test data
    await prismaService.user.deleteMany()
  })

  describe('/users (GET)', () => {
    it('should return empty array when no users', async () => {
      const response = await request(app.getHttpServer()).get('/users')

      expect(response.status).toBe(200)
      expect(response.body).toEqual([])
    })

    it('should return all users', async () => {
      // Create test user
      await prismaService.user.create({
        data: {
          supabaseId: 'test-supabase-id',
          email: 'test@example.com',
        },
      })

      const response = await request(app.getHttpServer()).get('/users')

      expect(response.status).toBe(200)
      expect(response.body).toHaveLength(1)
      expect(response.body[0].email).toBe('test@example.com')
    })
  })

  describe('/users/:id (GET)', () => {
    it('should return a user by id', async () => {
      const user = await prismaService.user.create({
        data: {
          supabaseId: 'test-supabase-id',
          email: 'test@example.com',
        },
      })

      const response = await request(app.getHttpServer()).get(
        `/users/${user.id}`
      )

      expect(response.status).toBe(200)
      expect(response.body.id).toBe(user.id)
      expect(response.body.email).toBe('test@example.com')
    })

    it('should return 404 for non-existent user', async () => {
      const response = await request(app.getHttpServer()).get(
        '/users/550e8400-e29b-41d4-a716-446655440000'
      )

      expect(response.status).toBe(404)
    })
  })

  describe('/users (POST)', () => {
    it('should create a new user', async () => {
      const createUserDto = {
        supabaseId: 'new-supabase-id',
        email: 'new@example.com',
      }

      const response = await request(app.getHttpServer())
        .post('/users')
        .send(createUserDto)

      expect(response.status).toBe(201)
      expect(response.body.email).toBe('new@example.com')
      expect(response.body.supabaseId).toBe('new-supabase-id')
      expect(response.body.id).toBeDefined()
    })
  })

  describe('/users/:id (DELETE)', () => {
    it('should delete a user', async () => {
      const user = await prismaService.user.create({
        data: {
          supabaseId: 'test-supabase-id',
          email: 'test@example.com',
        },
      })

      const response = await request(app.getHttpServer()).delete(
        `/users/${user.id}`
      )

      expect(response.status).toBe(204)

      // Verify user is deleted
      const deletedUser = await prismaService.user.findUnique({
        where: { id: user.id },
      })
      expect(deletedUser).toBeNull()
    })

    it('should return 404 when deleting non-existent user', async () => {
      const response = await request(app.getHttpServer()).delete(
        '/users/550e8400-e29b-41d4-a716-446655440000'
      )

      expect(response.status).toBe(404)
    })
  })
})
