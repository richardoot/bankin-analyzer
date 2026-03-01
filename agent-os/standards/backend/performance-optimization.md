# Backend Performance Optimization Standards

## Event Loop & Asynchronous Optimization

**Use worker threads for CPU-intensive operations.**  
Offload CPU-heavy tasks to worker threads to prevent event loop blocking and maintain application responsiveness.  

*Why?* Prevents main thread blocking, maintains sub-100ms response times, and enables better resource utilization.

**Example:**
```typescript
// worker/cpu-intensive.worker.ts
import { parentPort } from 'worker_threads'

parentPort?.on('message', async (data) => {
  const { operation, payload } = data
  
  try {
    let result
    switch (operation) {
      case 'hashPassword':
        result = await performPasswordHashing(payload)
        break
      case 'generateReport':
        result = await generateComplexReport(payload)
        break
      case 'imageProcessing':
        result = await processImage(payload)
        break
    }
    
    parentPort?.postMessage({ success: true, result })
  } catch (error) {
    parentPort?.postMessage({ success: false, error: error.message })
  }
})

// services/worker-pool.service.ts
import { Worker } from 'worker_threads'
import { Injectable } from '@nestjs/common'

@Injectable()
export class WorkerPoolService {
  private workers: Worker[] = []
  private queue: Array<{ operation: string; payload: any; resolve: Function; reject: Function }> = []
  private readonly maxWorkers = 4

  constructor() {
    this.initializeWorkers()
  }

  private initializeWorkers() {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker('./cpu-intensive.worker.js')
      worker.on('message', this.handleWorkerMessage.bind(this))
      worker.on('error', this.handleWorkerError.bind(this))
      this.workers.push(worker)
    }
  }

  async executeTask(operation: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const availableWorker = this.workers.find(w => !w.busy)
      
      if (availableWorker) {
        this.assignTask(availableWorker, operation, payload, resolve, reject)
      } else {
        this.queue.push({ operation, payload, resolve, reject })
      }
    })
  }

  private assignTask(worker: Worker, operation: string, payload: any, resolve: Function, reject: Function) {
    worker.busy = true
    worker.currentResolve = resolve
    worker.currentReject = reject
    worker.postMessage({ operation, payload })
  }

  private handleWorkerMessage(result: any) {
    const worker = this.workers.find(w => w.busy)
    if (worker) {
      worker.busy = false
      
      if (result.success) {
        worker.currentResolve(result.result)
      } else {
        worker.currentReject(new Error(result.error))
      }
      
      // Process queue
      if (this.queue.length > 0) {
        const nextTask = this.queue.shift()!
        this.assignTask(worker, nextTask.operation, nextTask.payload, nextTask.resolve, nextTask.reject)
      }
    }
  }
}

// Usage in service
@Injectable()
export class UserService {
  constructor(private workerPool: WorkerPoolService) {}

  async registerUser(userData: CreateUserData): Promise<User> {
    // CPU-intensive password hashing in worker thread
    const hashedPassword = await this.workerPool.executeTask('hashPassword', {
      password: userData.password,
      saltRounds: 12
    })

    const user = await this.userRepository.save({
      ...userData,
      password: hashedPassword
    })

    return user
  }
}
```

**Implement efficient async patterns with Promise.allSettled.**  
Use parallel execution patterns for independent async operations to minimize total execution time.  

*Why?* Reduces response times by 50-70% when dealing with multiple independent async operations.

**Example:**
```typescript
// ❌ Sequential execution - slow
async function getUserDashboardData(userId: string) {
  const user = await userService.findById(userId)           // 50ms
  const orders = await orderService.findByUserId(userId)    // 100ms
  const recommendations = await recommendationService.getForUser(userId) // 200ms
  const notifications = await notificationService.getUnread(userId)      // 75ms
  
  return { user, orders, recommendations, notifications }
  // Total: ~425ms
}

// ✅ Parallel execution with error handling - fast
async function getUserDashboardData(userId: string) {
  const results = await Promise.allSettled([
    userService.findById(userId),
    orderService.findByUserId(userId),
    recommendationService.getForUser(userId),
    notificationService.getUnread(userId)
  ])

  const [userResult, ordersResult, recommendationsResult, notificationsResult] = results

  return {
    user: userResult.status === 'fulfilled' ? userResult.value : null,
    orders: ordersResult.status === 'fulfilled' ? ordersResult.value : [],
    recommendations: recommendationsResult.status === 'fulfilled' ? recommendationsResult.value : [],
    notifications: notificationsResult.status === 'fulfilled' ? notificationsResult.value : [],
    errors: results.filter(r => r.status === 'rejected').map(r => r.reason)
  }
  // Total: ~200ms (max of all operations)
}

// Advanced parallel patterns with batching
@Injectable()
export class DataAggregationService {
  async getAnalyticsDashboard(dateRange: DateRange): Promise<AnalyticsDashboard> {
    // Group operations by data source for optimal batching
    const [userMetrics, orderMetrics, performanceMetrics] = await Promise.all([
      this.getUserMetrics(dateRange),
      this.getOrderMetrics(dateRange),
      this.getPerformanceMetrics(dateRange)
    ])

    // Secondary operations that depend on primary data
    const enrichedData = await Promise.allSettled([
      this.enrichUserData(userMetrics),
      this.calculateTrends(orderMetrics),
      this.generateInsights(performanceMetrics)
    ])

    return this.combineMetrics(userMetrics, orderMetrics, performanceMetrics, enrichedData)
  }

  private async getUserMetrics(dateRange: DateRange) {
    // Batch multiple related queries
    return Promise.all([
      this.analytics.getUserSignups(dateRange),
      this.analytics.getActiveUsers(dateRange),
      this.analytics.getUserRetention(dateRange)
    ])
  }
}
```

## Memory Management & Garbage Collection

**Implement proper memory management patterns.**  
Use WeakMap, WeakSet, and proper cleanup strategies to prevent memory leaks and optimize garbage collection.  

*Why?* Prevents memory leaks, reduces GC pressure, and maintains stable memory usage under load.

**Example:**
```typescript
// ✅ Memory-efficient caching with WeakMap
class UserSessionManager {
  private sessionData = new WeakMap<User, SessionInfo>()
  private activeConnections = new WeakSet<WebSocket>()

  createSession(user: User, socket: WebSocket): void {
    // WeakMap automatically cleans up when user object is garbage collected
    this.sessionData.set(user, {
      lastActivity: Date.now(),
      permissions: user.permissions,
      preferences: user.preferences
    })

    // WeakSet automatically removes socket when it's garbage collected
    this.activeConnections.add(socket)

    // Setup cleanup on disconnect
    socket.on('close', () => {
      this.cleanupSession(user)
    })
  }

  private cleanupSession(user: User): void {
    // Explicit cleanup for immediate memory release
    this.sessionData.delete(user)
  }
}

// ✅ Streaming for large data processing
@Injectable()
export class DataExportService {
  async exportUserData(filters: ExportFilters): Promise<ReadableStream> {
    const stream = new ReadableStream({
      start(controller) {
        // Initialize export
      },

      async pull(controller) {
        try {
          // Process data in chunks to avoid memory buildup
          const chunk = await this.getNextDataChunk(filters)
          
          if (chunk.length === 0) {
            controller.close()
            return
          }

          // Transform and enqueue chunk
          const csvChunk = this.transformToCSV(chunk)
          controller.enqueue(csvChunk)
          
          // Clear chunk reference for GC
          chunk.length = 0
        } catch (error) {
          controller.error(error)
        }
      }
    })

    return stream
  }

  private async getNextDataChunk(filters: ExportFilters, batchSize = 1000) {
    // Use cursor-based pagination to avoid memory issues
    return this.repository.findWithCursor(filters, batchSize)
  }
}

// ✅ Object pooling for frequently created objects
class ObjectPool<T> {
  private pool: T[] = []
  private createFn: () => T
  private resetFn: (obj: T) => void

  constructor(createFn: () => T, resetFn: (obj: T) => void, initialSize = 10) {
    this.createFn = createFn
    this.resetFn = resetFn
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createFn())
    }
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!
    }
    return this.createFn()
  }

  release(obj: T): void {
    this.resetFn(obj)
    this.pool.push(obj)
  }
}

// Usage for expensive object creation
const bufferPool = new ObjectPool(
  () => Buffer.alloc(1024 * 1024), // 1MB buffer
  (buffer) => buffer.fill(0),      // Reset buffer
  5                                // Keep 5 buffers in pool
)

@Injectable()
export class FileProcessingService {
  async processFile(file: File): Promise<ProcessedFile> {
    const buffer = bufferPool.acquire()
    
    try {
      // Use buffer for file processing
      const result = await this.performProcessing(file, buffer)
      return result
    } finally {
      // Always return buffer to pool
      bufferPool.release(buffer)
    }
  }
}
```

## Database Query Optimization

**Implement efficient query patterns and connection pooling.**  
Optimize database interactions through proper indexing, query patterns, and connection management.  

*Why?* Reduces query times from seconds to milliseconds and prevents database connection exhaustion.

**Example:**
```typescript
// ✅ Optimized MongoDB connection and querying
@Injectable()
export class OptimizedUserRepository {
  private readonly connection: Connection

  constructor() {
    this.connection = mongoose.createConnection(process.env.DATABASE_URL, {
      // Optimized connection pool settings
      maxPoolSize: 10,          // Maximum connections
      minPoolSize: 2,           // Minimum connections
      maxIdleTimeMS: 30000,     // Close idle connections after 30s
      serverSelectionTimeoutMS: 5000,  // Timeout for server selection
      socketTimeoutMS: 45000,   // Socket timeout
      
      // Performance optimizations
      bufferMaxEntries: 0,      // Disable mongoose buffering
      bufferCommands: false,    // Disable command buffering
      
      // Read preferences for performance
      readPreference: 'secondaryPreferred',
      readConcern: { level: 'local' },
      
      // Compression
      compressors: ['zstd', 'zlib']
    })
  }

  // ✅ Efficient pagination with cursor-based approach
  async findUsersWithCursor(
    filters: UserFilters,
    limit = 20,
    cursor?: string
  ): Promise<{ users: User[]; nextCursor?: string }> {
    const query: any = { ...filters }
    
    if (cursor) {
      query._id = { $gt: new ObjectId(cursor) }
    }

    const users = await this.User
      .find(query)
      .sort({ _id: 1 })
      .limit(limit + 1)
      .lean()  // Return plain objects for better performance
      .exec()

    const hasNext = users.length > limit
    if (hasNext) users.pop()

    return {
      users,
      nextCursor: hasNext ? users[users.length - 1]._id.toString() : undefined
    }
  }

  // ✅ Aggregation pipeline optimization
  async getUserAnalytics(dateRange: DateRange): Promise<UserAnalytics> {
    const pipeline = [
      // Match early to reduce document processing
      {
        $match: {
          createdAt: {
            $gte: dateRange.start,
            $lte: dateRange.end
          },
          status: 'active'
        }
      },
      
      // Group and calculate in single stage when possible
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          userCount: { $sum: 1 },
          avgAge: { $avg: '$age' },
          totalRevenue: { $sum: '$totalSpent' }
        }
      },
      
      // Sort by date
      {
        $sort: { _id: 1 }
      },
      
      // Use $facet for multiple aggregations in single pass
      {
        $facet: {
          daily: [
            { $match: {} }  // Pass through all documents
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalUsers: { $sum: '$userCount' },
                avgDailyRevenue: { $avg: '$totalRevenue' }
              }
            }
          ]
        }
      }
    ]

    const [result] = await this.User.aggregate(pipeline).exec()
    return {
      dailyStats: result.daily,
      summary: result.summary[0]
    }
  }

  // ✅ Bulk operations for better performance
  async bulkUpdateUsers(updates: UserUpdate[]): Promise<BulkWriteResult> {
    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { _id: update.userId },
        update: { $set: update.data },
        upsert: false
      }
    }))

    return this.User.bulkWrite(bulkOps, {
      ordered: false,  // Allow parallel execution
      bypassDocumentValidation: false
    })
  }

  // ✅ Efficient existence checks
  async userExists(email: string): Promise<boolean> {
    const count = await this.User
      .countDocuments({ email }, { limit: 1 })
      .exec()
    
    return count > 0
  }

  // ✅ Optimized search with text indexes
  async searchUsers(
    searchTerm: string,
    filters: SearchFilters = {}
  ): Promise<User[]> {
    const query = {
      $text: { $search: searchTerm },
      ...filters
    }

    return this.User
      .find(query, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(50)
      .lean()
      .exec()
  }
}

// ✅ Query result caching with TTL
@Injectable()
export class CachedUserService {
  constructor(
    private userRepository: OptimizedUserRepository,
    private cacheService: CacheService
  ) {}

  async getUser(userId: string): Promise<User | null> {
    const cacheKey = `user:${userId}`
    
    // Try cache first
    const cached = await this.cacheService.get<User>(cacheKey)
    if (cached) return cached

    // Fallback to database
    const user = await this.userRepository.findById(userId)
    
    if (user) {
      // Cache for 5 minutes
      await this.cacheService.set(cacheKey, user, 300)
    }

    return user
  }

  async invalidateUserCache(userId: string): Promise<void> {
    const cacheKeys = [
      `user:${userId}`,
      `user:profile:${userId}`,
      `user:permissions:${userId}`
    ]

    await Promise.all(
      cacheKeys.map(key => this.cacheService.delete(key))
    )
  }
}
```

## Caching Strategies

**Implement multi-layer caching with Redis.**  
Use strategic caching at multiple levels to minimize database load and improve response times.  

*Why?* Reduces database load by 80-90% and improves response times from 200ms to 10-50ms.

**Example:**
```typescript
// ✅ Redis caching service with advanced patterns
@Injectable()
export class CacheService {
  private redis: Redis
  private localCache = new Map<string, { data: any; expires: number }>()

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      
      // Connection pool settings
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
      
      // Performance optimizations
      enableAutoPipelining: true,
      maxmemoryPolicy: 'allkeys-lru',
      
      // Compression for large values
      compression: 'gzip'
    })
  }

  // Multi-level cache: Memory -> Redis -> Database
  async get<T>(key: string): Promise<T | null> {
    // L1: Check local memory cache (fastest)
    const localValue = this.localCache.get(key)
    if (localValue && localValue.expires > Date.now()) {
      return localValue.data
    }

    // L2: Check Redis cache
    try {
      const redisValue = await this.redis.get(key)
      if (redisValue) {
        const data = JSON.parse(redisValue)
        
        // Update local cache
        this.localCache.set(key, {
          data,
          expires: Date.now() + 30000 // 30s local cache
        })
        
        return data
      }
    } catch (error) {
      console.error('Redis get error:', error)
    }

    return null
  }

  async set<T>(key: string, value: T, ttlSeconds = 3600): Promise<void> {
    try {
      // Set in Redis with TTL
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value))
      
      // Set in local cache with shorter TTL
      this.localCache.set(key, {
        data: value,
        expires: Date.now() + Math.min(ttlSeconds * 1000, 30000)
      })
    } catch (error) {
      console.error('Cache set error:', error)
    }
  }

  // Batch operations for efficiency
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.redis.mget(...keys)
      return values.map(value => value ? JSON.parse(value) : null)
    } catch (error) {
      console.error('Cache mget error:', error)
      return keys.map(() => null)
    }
  }

  async mset(keyValuePairs: Record<string, any>, ttlSeconds = 3600): Promise<void> {
    try {
      const pipeline = this.redis.pipeline()
      
      Object.entries(keyValuePairs).forEach(([key, value]) => {
        pipeline.setex(key, ttlSeconds, JSON.stringify(value))
      })
      
      await pipeline.exec()
    } catch (error) {
      console.error('Cache mset error:', error)
    }
  }

  // Cache-aside pattern with automatic refresh
  async getOrSet<T>(
    key: string,
    fallbackFn: () => Promise<T>,
    ttlSeconds = 3600
  ): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) return cached

    const data = await fallbackFn()
    await this.set(key, data, ttlSeconds)
    return data
  }

  // Distributed cache invalidation
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern)
      if (keys.length > 0) {
        await this.redis.del(...keys)
      }
      
      // Clear matching local cache entries
      for (const [key] of this.localCache) {
        if (this.matchesPattern(key, pattern)) {
          this.localCache.delete(key)
        }
      }
    } catch (error) {
      console.error('Cache invalidation error:', error)
    }
  }

  private matchesPattern(key: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'))
    return regex.test(key)
  }
}

// ✅ Application-level caching strategies
@Injectable()
export class ProductService {
  constructor(
    private productRepository: ProductRepository,
    private cacheService: CacheService
  ) {}

  // Cache expensive calculations
  async getProductRecommendations(userId: string): Promise<Product[]> {
    const cacheKey = `recommendations:${userId}`
    
    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        // Expensive ML/algorithm computation
        const userPreferences = await this.getUserPreferences(userId)
        const recommendations = await this.computeRecommendations(userPreferences)
        return recommendations
      },
      1800 // 30 minutes cache
    )
  }

  // Cache with dependency invalidation
  async updateProduct(productId: string, updates: ProductUpdate): Promise<Product> {
    const product = await this.productRepository.update(productId, updates)
    
    // Invalidate related caches
    await Promise.all([
      this.cacheService.delete(`product:${productId}`),
      this.cacheService.invalidatePattern(`recommendations:*`),
      this.cacheService.invalidatePattern(`category:${product.categoryId}:*`)
    ])
    
    return product
  }

  // Preemptive cache warming
  async warmupPopularProducts(): Promise<void> {
    const popularProductIds = await this.getPopularProductIds()
    
    // Warm cache in batches to avoid overwhelming the database
    const batchSize = 10
    for (let i = 0; i < popularProductIds.length; i += batchSize) {
      const batch = popularProductIds.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (productId) => {
          const cacheKey = `product:${productId}`
          const exists = await this.cacheService.get(cacheKey)
          
          if (!exists) {
            const product = await this.productRepository.findById(productId)
            if (product) {
              await this.cacheService.set(cacheKey, product, 3600)
            }
          }
        })
      )
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
}
```

## API Response Optimization

**Implement response compression and efficient serialization.**  
Optimize API responses through compression, efficient data structures, and smart serialization.  

*Why?* Reduces response sizes by 60-80% and improves API response times significantly.

**Example:**
```typescript
// ✅ Response compression middleware
import compression from 'compression'
import { NestFactory } from '@nestjs/core'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  
  // Enable compression with optimal settings
  app.use(compression({
    level: 6,        // Good balance of compression vs CPU
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
      // Don't compress responses if client doesn't support it
      if (req.headers['x-no-compression']) return false
      
      // Use compression filter
      return compression.filter(req, res)
    }
  }))
  
  await app.listen(3000)
}

// ✅ Response optimization interceptor
@Injectable()
export class ResponseOptimizationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()
    const response = context.switchToHttp().getResponse()
    
    return next.handle().pipe(
      map(data => {
        // Set optimal cache headers
        if (this.isCacheable(request)) {
          response.setHeader('Cache-Control', 'public, max-age=300') // 5 minutes
          response.setHeader('ETag', this.generateETag(data))
        }
        
        // Optimize response based on client capabilities
        return this.optimizeResponse(data, request)
      }),
      
      // Add response time header
      tap(() => {
        const responseTime = Date.now() - request.startTime
        response.setHeader('X-Response-Time', `${responseTime}ms`)
      })
    )
  }

  private optimizeResponse(data: any, request: any): any {
    // Remove sensitive fields
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeObject(item))
    }
    
    return this.sanitizeObject(data)
  }

  private sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj
    
    const sanitized = { ...obj }
    
    // Remove fields that shouldn't be exposed
    delete sanitized.password
    delete sanitized.internalId
    delete sanitized.__v
    
    // Convert ObjectIds to strings
    if (sanitized._id) {
      sanitized.id = sanitized._id.toString()
      delete sanitized._id
    }
    
    return sanitized
  }

  private generateETag(data: any): string {
    const hash = createHash('md5')
    hash.update(JSON.stringify(data))
    return `"${hash.digest('hex')}"`
  }

  private isCacheable(request: any): boolean {
    return request.method === 'GET' && !request.headers.authorization
  }
}

// ✅ Pagination and field selection
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  async findUsers(
    @Query() query: FindUsersQuery
  ): Promise<PaginatedResponse<User>> {
    const {
      page = 1,
      limit = 20,
      fields,
      sort = 'createdAt',
      order = 'desc'
    } = query

    // Validate and limit page size
    const validatedLimit = Math.min(Math.max(limit, 1), 100)
    
    // Parse field selection
    const selectedFields = fields 
      ? fields.split(',').filter(field => this.isAllowedField(field))
      : undefined

    const result = await this.usersService.findWithPagination({
      page,
      limit: validatedLimit,
      fields: selectedFields,
      sort: { [sort]: order === 'desc' ? -1 : 1 }
    })

    return {
      data: result.users,
      pagination: {
        page,
        limit: validatedLimit,
        total: result.total,
        pages: Math.ceil(result.total / validatedLimit),
        hasNext: page * validatedLimit < result.total,
        hasPrev: page > 1
      }
    }
  }

  private isAllowedField(field: string): boolean {
    const allowedFields = ['id', 'name', 'email', 'createdAt', 'status']
    return allowedFields.includes(field)
  }
}

// ✅ Efficient data transformation
@Injectable()
export class DataTransformService {
  // Use Map for O(1) lookups instead of find() on arrays
  private transformWithLookup<T, R>(
    items: T[],
    relatedData: R[],
    keyExtractor: (item: T) => string,
    relatedKeyExtractor: (data: R) => string,
    transform: (item: T, related?: R) => any
  ): any[] {
    // Build lookup map once
    const lookupMap = new Map(
      relatedData.map(data => [relatedKeyExtractor(data), data])
    )

    // Transform with O(1) lookups
    return items.map(item => {
      const key = keyExtractor(item)
      const related = lookupMap.get(key)
      return transform(item, related)
    })
  }

  async transformUsersWithProfiles(users: User[]): Promise<UserWithProfile[]> {
    // Fetch all profiles in one query
    const userIds = users.map(user => user.id)
    const profiles = await this.profileService.findByUserIds(userIds)

    return this.transformWithLookup(
      users,
      profiles,
      user => user.id,
      profile => profile.userId,
      (user, profile) => ({
        ...user,
        profile: profile || null
      })
    )
  }
}
```