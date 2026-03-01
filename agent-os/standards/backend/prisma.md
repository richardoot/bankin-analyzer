# Prisma v7 ORM Standards

These standards outline best practices for using Prisma v7 as your database ORM in Node.js backend projects. They emphasize type safety, performance, maintainability, and modern development patterns.

## Setup and Configuration

**Use Prisma v7 with proper TypeScript configuration.**  
Configure Prisma with strict TypeScript settings for maximum type safety.  

*Why?* Prisma v7 provides enhanced TypeScript support with stricter types and better inference, reducing runtime errors.

**Example:**
```json
// package.json
{
  "dependencies": {
    "prisma": "^7.0.0",
    "@prisma/client": "^7.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}
```

```typescript
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  output   = "../node_modules/.prisma/client"
  binaryTargets = ["native"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Configure database connection with pooling.**  
Use connection pooling and proper connection limits for production environments.  

*Why?* Prevents database connection exhaustion and improves performance under load.

**Example:**
```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  relationMode = "foreignKeys"
}

// .env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public&connection_limit=20&pool_timeout=20"
```

## Schema Design Best Practices

**Use descriptive field names and follow naming conventions.**  
Follow camelCase for fields and PascalCase for models, use descriptive names that clearly indicate the field's purpose.  

*Why?* Improves code readability and maintains consistency across the application.

**Example:**
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  firstName String
  lastName  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Relations
  posts     Post[]
  profile   UserProfile?
  
  @@map("users")
}

model UserProfile {
  id     String @id @default(cuid())
  bio    String?
  avatar String?
  userId String @unique
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("user_profiles")
}
```

**Implement proper indexing strategies.**  
Add indexes on frequently queried fields, foreign keys, and unique constraints.  

*Why?* Dramatically improves query performance, especially on large datasets.

**Example:**
```prisma
model Post {
  id          String   @id @default(cuid())
  title       String
  content     String
  published   Boolean  @default(false)
  authorId    String
  categoryId  String
  slug        String   @unique
  publishedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  author   User     @relation(fields: [authorId], references: [id])
  category Category @relation(fields: [categoryId], references: [id])
  tags     TagOnPost[]
  
  // Indexes for performance
  @@index([authorId])
  @@index([categoryId])
  @@index([published, publishedAt])
  @@index([slug])
  @@map("posts")
}
```

**Use appropriate field types and constraints.**  
Choose the most suitable field types and add database-level constraints for data integrity.  

*Why?* Ensures data consistency and leverages database-level validation for better performance.

**Example:**
```prisma
model Product {
  id          String   @id @default(cuid())
  name        String   @db.VarChar(255)
  description String   @db.Text
  price       Decimal  @db.Decimal(10, 2)
  stock       Int      @default(0) @db.Integer
  sku         String   @unique @db.VarChar(50)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)
  
  @@map("products")
}
```

## Query Optimization Patterns

**Use select to fetch only needed fields.**  
Always specify which fields you need instead of fetching entire objects.  

*Why?* Reduces network bandwidth and memory usage, especially important for large objects or lists.

**Example:**
```typescript
// ❌ Bad: Fetches all fields
const users = await prisma.user.findMany();

// ✅ Good: Fetch only needed fields
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
  },
});
```

**Prevent N+1 queries with include and select.**  
Use include or select with nested relations to fetch related data in a single query.  

*Why?* Eliminates multiple round trips to the database, significantly improving performance.

**Example:**
```typescript
// ❌ Bad: N+1 query problem
const posts = await prisma.post.findMany();
const postsWithAuthors = await Promise.all(
  posts.map(async (post) => ({
    ...post,
    author: await prisma.user.findUnique({ where: { id: post.authorId } }),
  }))
);

// ✅ Good: Single query with include
const postsWithAuthors = await prisma.post.findMany({
  include: {
    author: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    },
    category: {
      select: {
        id: true,
        name: true,
      },
    },
  },
});
```

**Implement pagination for large datasets.**  
Use cursor-based or offset-based pagination for better performance on large result sets.  

*Why?* Prevents memory exhaustion and provides better user experience with faster response times.

**Example:**
```typescript
// Cursor-based pagination (preferred)
async function getPaginatedPosts(cursor?: string, take: number = 10) {
  return await prisma.post.findMany({
    take,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      excerpt: true,
      createdAt: true,
      author: {
        select: { firstName: true, lastName: true },
      },
    },
  });
}

// Offset-based pagination (for specific page requirements)
async function getPostsPage(page: number = 1, pageSize: number = 10) {
  const skip = (page - 1) * pageSize;
  
  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.post.count(),
  ]);
  
  return {
    posts,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
```

## Transaction Management

**Use interactive transactions for complex operations.**  
Wrap related database operations in transactions to maintain data consistency.  

*Why?* Ensures atomicity of operations and prevents partial data corruption in case of errors.

**Example:**
```typescript
async function transferFunds(fromUserId: string, toUserId: string, amount: number) {
  return await prisma.$transaction(async (tx) => {
    // Check sender's balance
    const sender = await tx.user.findUnique({
      where: { id: fromUserId },
      select: { balance: true },
    });
    
    if (!sender || sender.balance < amount) {
      throw new Error('Insufficient funds');
    }
    
    // Update sender's balance
    await tx.user.update({
      where: { id: fromUserId },
      data: { balance: { decrement: amount } },
    });
    
    // Update receiver's balance
    await tx.user.update({
      where: { id: toUserId },
      data: { balance: { increment: amount } },
    });
    
    // Create transaction record
    return await tx.transaction.create({
      data: {
        fromUserId,
        toUserId,
        amount,
        type: 'TRANSFER',
      },
    });
  });
}
```

**Handle transaction errors gracefully.**  
Implement proper error handling for transaction failures with meaningful error messages.  

*Why?* Provides better debugging capabilities and user feedback when transactions fail.

**Example:**
```typescript
async function createUserWithProfile(userData: CreateUserData) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
          },
        });
        
        const profile = await tx.userProfile.create({
          data: {
            userId: user.id,
            bio: userData.bio,
            avatar: userData.avatar,
          },
        });
        
        return { user, profile };
      },
      {
        maxWait: 5000, // 5 seconds
        timeout: 10000, // 10 seconds
      }
    );
  } catch (error) {
    if (error.code === 'P2002') {
      throw new Error('User with this email already exists');
    }
    throw new Error(`Failed to create user: ${error.message}`);
  }
}
```

## Type Safety and Code Generation

**Use Prisma's generated types throughout the application.**  
Leverage Prisma's TypeScript types for better type safety and autocompletion.  

*Why?* Ensures type consistency between database schema and application code, reducing runtime errors.

**Example:**
```typescript
import { User, Post, Prisma } from '@prisma/client';

// Use generated types for function parameters
async function updateUser(
  id: string, 
  data: Prisma.UserUpdateInput
): Promise<User> {
  return await prisma.user.update({
    where: { id },
    data,
  });
}

// Type for user with posts
type UserWithPosts = Prisma.UserGetPayload<{
  include: { posts: true };
}>;

// Type for specific select fields
type UserSummary = Prisma.UserGetPayload<{
  select: {
    id: true;
    email: true;
    firstName: true;
    lastName: true;
  };
}>;
```

**Create custom types for complex queries.**  
Define custom types for complex query results to maintain type safety.  

*Why?* Provides clear interfaces for complex data structures and improves code maintainability.

**Example:**
```typescript
// Define custom input types
interface CreatePostInput {
  title: string;
  content: string;
  categoryId: string;
  tags: string[];
  publishedAt?: Date;
}

// Define custom output types
interface PostWithDetails extends Prisma.PostGetPayload<{
  include: {
    author: { select: { firstName: true; lastName: true; email: true } };
    category: { select: { name: true; slug: true } };
    tags: { include: { tag: true } };
  };
}> {}

async function createPostWithTags(
  authorId: string,
  input: CreatePostInput
): Promise<PostWithDetails> {
  return await prisma.post.create({
    data: {
      title: input.title,
      content: input.content,
      authorId,
      categoryId: input.categoryId,
      publishedAt: input.publishedAt,
      tags: {
        create: input.tags.map(tagName => ({
          tag: {
            connectOrCreate: {
              where: { name: tagName },
              create: { name: tagName, slug: tagName.toLowerCase() },
            },
          },
        })),
      },
    },
    include: {
      author: { select: { firstName: true, lastName: true, email: true } },
      category: { select: { name: true, slug: true } },
      tags: { include: { tag: true } },
    },
  });
}
```

## Error Handling and Logging

**Handle Prisma-specific errors appropriately.**  
Catch and transform Prisma errors into meaningful application errors.  

*Why?* Provides better error messages to users and prevents sensitive database information from being exposed.

**Example:**
```typescript
import { Prisma } from '@prisma/client';

class DatabaseError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

async function handlePrismaError(operation: () => Promise<any>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002':
          throw new DatabaseError('A record with this data already exists', 'DUPLICATE_ENTRY');
        case 'P2025':
          throw new DatabaseError('Record not found', 'NOT_FOUND');
        case 'P2003':
          throw new DatabaseError('Foreign key constraint failed', 'CONSTRAINT_FAILED');
        default:
          throw new DatabaseError(`Database error: ${error.message}`, error.code);
      }
    }
    
    if (error instanceof Prisma.PrismaClientValidationError) {
      throw new DatabaseError('Invalid data provided', 'VALIDATION_ERROR');
    }
    
    throw error;
  }
}

// Usage
async function createUser(userData: Prisma.UserCreateInput) {
  return handlePrismaError(async () => {
    return await prisma.user.create({ data: userData });
  });
}
```

**Implement query logging for development and debugging.**  
Enable query logging in development to monitor and optimize database queries.  

*Why?* Helps identify slow queries and optimize database performance during development.

**Example:**
```typescript
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  log      = ["query", "info", "warn", "error"]
}

// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

// Add query timing middleware
prisma.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();
  
  console.log(`Query ${params.model}.${params.action} took ${after - before}ms`);
  return result;
});

export { prisma };
```

## Testing Strategies

**Use a separate test database with transaction rollback.**  
Configure a dedicated test database and use transactions that roll back after each test.  

*Why?* Ensures test isolation and prevents test data from affecting other tests or development data.

**Example:**
```typescript
// tests/setup.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_TEST_URL,
    },
  },
});

export { prisma };

// tests/user.test.ts
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { prisma } from './setup';

describe('User Service', () => {
  beforeEach(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.user.deleteMany();
      // Reset auto-increment or seed test data
    });
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  it('should create a user successfully', async () => {
    const userData = {
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
    };

    const user = await prisma.user.create({
      data: userData,
    });

    expect(user.email).toBe(userData.email);
    expect(user.id).toBeDefined();
  });
});
```

**Mock Prisma for unit tests of business logic.**  
Create mocks for Prisma client when testing business logic in isolation.  

*Why?* Enables fast unit tests without database dependencies and allows testing edge cases easily.

**Example:**
```typescript
// tests/mocks/prisma.ts
import { jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';

export const prismaMock = {
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  post: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
} as unknown as PrismaClient;

// tests/user-service.test.ts
import { UserService } from '../src/services/user.service';
import { prismaMock } from './mocks/prisma';

const userService = new UserService(prismaMock);

describe('UserService', () => {
  it('should return user by id', async () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
    };

    prismaMock.user.findUnique.mockResolvedValue(mockUser);

    const user = await userService.findById('1');

    expect(user).toEqual(mockUser);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });
});
```

These standards ensure you're using Prisma v7 effectively with modern Node.js applications, focusing on type safety, performance, and maintainability.