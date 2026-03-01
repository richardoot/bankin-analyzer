# NestJS Framework Standards

## Architecture & Module Design

**Follow modular, feature-based architecture.**  
Organize code by features rather than technical layers, with clear module boundaries.  

*Why?* Improves maintainability and allows teams to work independently on different features.

**Example:**
```typescript
// src/modules/user/user.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService]
})
export class UserModule {}
```

**Keep controllers thin and delegate to services.**  
Controllers should only handle HTTP concerns; business logic belongs in services.  

*Why?* Separation of concerns makes code easier to test and maintain.

**Example:**
```typescript
@Controller('users')
@ApiTags('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOkResponse({ type: [UserResponseDto] })
  async findAll(): Promise<UserResponseDto[]> {
    return this.userService.findAll();
  }
}
```

## Dependency Injection Best Practices

**Use constructor injection with readonly modifiers.**  
Inject dependencies through constructor parameters marked as readonly.  

*Why?* Ensures immutability and makes dependencies explicit in the constructor.

**Example:**
```typescript
@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly configService: ConfigService,
  ) {}
}
```

**Implement proper scoping for stateful services.**  
Use REQUEST scope for services that need per-request state.  

*Why?* Prevents memory leaks and ensures proper isolation between requests.

**Example:**
```typescript
@Injectable({ scope: Scope.REQUEST })
export class RequestScopedService {
  private requestData: any;
}
```

**Use forwardRef() for circular dependencies.**  
Resolve circular dependencies with forwardRef when necessary.  

*Why?* Allows TypeScript to properly resolve types in circular dependency scenarios.

**Example:**
```typescript
@Injectable()
export class UserService {
  constructor(
    @Inject(forwardRef(() => PostService))
    private postService: PostService,
  ) {}
}
```

## Performance Optimization

**Use Fastify adapter for better performance.**  
Replace Express with Fastify for 2-3x better request throughput.  

*Why?* Fastify provides superior performance through schema-based validation and lower overhead.

**Example:**
```typescript
// main.ts
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );
  await app.listen(3000, '0.0.0.0');
}
```

**Implement proper caching strategies.**  
Use Redis caching for frequently accessed data with appropriate TTL.  

*Why?* Reduces database load and improves response times for expensive operations.

**Example:**
```typescript
@Injectable()
export class UserService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private userRepository: Repository<User>,
  ) {}

  async findUser(id: number): Promise<User> {
    const cached = await this.cacheManager.get(`user:${id}`);
    if (cached) return cached;

    const user = await this.userRepository.findOne({ where: { id } });
    await this.cacheManager.set(`user:${id}`, user, 300);
    return user;
  }
}
```

## Authentication & Authorization

**Use JWT with proper token management.**  
Implement JWT authentication with refresh token rotation for security.  

*Why?* Provides stateless authentication while maintaining security through token rotation.

**Example:**
```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    return { userId: payload.sub, username: payload.username };
  }
}
```

**Implement role-based access control with guards.**  
Use custom guards for role-based authorization logic.  

*Why?* Centralizes authorization logic and makes permissions declarative.

**Example:**
```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!roles) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    return roles.some(role => user.roles?.includes(role));
  }
}
```

## API Documentation with OpenAPI

**Document all endpoints with comprehensive Swagger decorators.**  
Use OpenAPI decorators to generate complete, accurate documentation.  

*Why?* Improves API discoverability and reduces integration effort for consumers.

**Example:**
```typescript
@ApiTags('users')
@Controller('users')
export class UserController {
  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiCreatedResponse({
    description: 'User successfully created',
    type: UserResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiConflictResponse({ description: 'Email already exists' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }
}
```

**Use DTO classes with validation decorators.**  
Define data transfer objects with comprehensive validation rules.  

*Why?* Ensures type safety and automatic request validation with clear error messages.

**Example:**
```typescript
export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;
}
```

## Testing Strategies

**Write comprehensive unit tests with TestingModule.**  
Test services and controllers in isolation using NestJS testing utilities.  

*Why?* Ensures code reliability and makes refactoring safer.

**Example:**
```typescript
describe('UserService', () => {
  let service: UserService;
  let repository: Repository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should find all users', async () => {
    const users = [{ id: 1, name: 'John' }];
    jest.spyOn(repository, 'find').mockResolvedValue(users as User[]);

    const result = await service.findAll();
    expect(result).toEqual(users);
  });
});
```

**Implement E2E tests for critical user flows.**  
Test complete request/response cycles including authentication and authorization.  

*Why?* Validates that all components work together correctly in realistic scenarios.

**Example:**
```typescript
describe('UserController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/users (GET)', () => {
    return request(app.getHttpServer())
      .get('/users')
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });
});
```