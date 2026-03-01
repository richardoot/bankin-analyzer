# Node.js Coding Standards

These standards outline best practices for writing Node.js code in our backend projects. They emphasize modularity, performance, security, and maintainability. Follow these to ensure consistent, scalable applications.

## Project Architecture Practices

**Use a modular, layered architecture.**  
Organize code into layers: controllers, services, repositories, and utilities. This promotes separation of concerns and easier testing.  

*Why?* It improves scalability and allows independent evolution of components, especially in large apps.

**Example:**
```typescript
// src/modules/user/user.controller.ts
import { Controller, Get } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll() {
    return this.userService.findAll();
  }
}

// src/modules/user/user.service.ts
import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  findAll() {
    return this.userRepository.findAll();
  }
}
```

**Prefer ES modules over CommonJS.**  
Use `import/export` syntax and set `"type": "module"` in `package.json`.  

*Why?* ES modules are the modern standard, enabling better tree-shaking and static analysis in 2025.

**Example:**
```json
// package.json
{
  "type": "module"
}
```

```typescript
// Import
import express from 'express';
```

## Error Handling Practices

**Implement centralized error handling.**  
Use middleware or global filters to catch and format errors consistently. Always log errors with context.  

*Why?* Centralized handling reduces boilerplate and ensures uniform error responses, improving debugging.

**Example:**
```typescript
// src/common/filters/http-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    console.error(`Error on ${request.url}:`, exception.getResponse());

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

**Never throw generic errors; use custom ones.**  
Define domain-specific error classes extending `Error`.  

*Why?* Provides better traceability and user-friendly messages without exposing internals.

**Example:**
```typescript
class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// Usage
throw new DatabaseError('Failed to connect to MongoDB');
```

## Performance Optimization Practices

**Use Fastify over Express for new projects.**  
Fastify offers better performance due to schema-based validation and lower overhead.  

*Why?* In 2025 benchmarks, Fastify handles 2-3x more requests per second than Express.

**Example:**
```typescript
// Install: npm i fastify @fastify/nestjs
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new FastifyAdapter());
  await app.listen(3000);
}
bootstrap();
```

**Paginate large result sets and use JSON streams for large objects.**  
Implement pagination in queries and stream JSON for big payloads.  

*Why?* Prevents memory exhaustion and improves response times for data-intensive APIs.

**Example:**
```typescript
// Pagination in service
findAll(page: number = 1, limit: number = 10) {
  const skip = (page - 1) * limit;
  return this.userRepository.find().skip(skip).limit(limit);
}

// Streaming JSON
import { Transform } from 'stream';

const stream = new Transform({
  objectMode: true,
  transform(chunk, encoding, callback) {
    this.push(JSON.stringify(chunk) + '\n');
    callback();
  },
});
```

## Security Practices

**Validate and sanitize all inputs.**  
Use libraries like Joi or class-validator for schema validation.  

*Why?* Mitigates injection attacks and ensures data integrity, a core concern in 2025 with rising API exposures.

**Example:**
```typescript
import { IsEmail, IsString } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;
}
```

**Enable strict mode and avoid dynamic requires.**  
Use `node --trace-warnings` in development and static imports.  

*Why?* Catches subtle bugs early and enhances security by preventing runtime code injection.

## Testing and Quality Practices

**Write unit and integration tests with Jest or Vitest.**  
Aim for 80%+ coverage; test edge cases and errors.  

*Why?* Ensures reliability in production, where Node.js apps scale under load.

**Example:**
```typescript
// user.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserService],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

**Lint with ESLint and Prettier.**  
Enforce consistent style and catch issues early.  

*Why?* Maintains code quality in team environments.

Ces standards sont basés sur les pratiques modernes de 2025 pour Node.js. Tu peux les sauvegarder dans `~/agent-os/profiles/default/standards/backend/nodejs.md`.

Est-ce que je peux passer au markdown suivant pour npm (npm.md) ?
