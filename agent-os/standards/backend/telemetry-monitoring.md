# Telemetry & Monitoring Standards

## OpenTelemetry Implementation

**Use OpenTelemetry as the standard for observability.**  
Implement OpenTelemetry for vendor-neutral telemetry collection across your application.  

*Why?* Provides standardized observability without vendor lock-in and enables easy switching between monitoring providers.

**Example:**
```typescript
// app.module.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-http': {
      ignoreIncomingRequestHook: (req) => {
        return req.url?.includes('/health') || req.url?.includes('/metrics');
      },
    },
  })],
  serviceName: process.env.SERVICE_NAME || 'nestjs-app',
  serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
});

sdk.start();
```

**Implement distributed tracing for microservices.**  
Add trace context propagation between services for end-to-end request tracking.  

*Why?* Essential for debugging issues in distributed systems and understanding request flow.

**Example:**
```typescript
// tracing.service.ts
import { Injectable } from '@nestjs/common';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class TracingService {
  private tracer = trace.getTracer('user-service');

  async traceOperation<T>(
    name: string,
    operation: () => Promise<T>,
    attributes?: Record<string, string | number>
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, async (span) => {
      try {
        if (attributes) {
          span.setAttributes(attributes);
        }
        
        const result = await operation();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: error.message 
        });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
```

## Structured Logging Best Practices

**Implement structured logging with consistent format.**  
Use JSON logging with standardized fields for better searchability and analysis.  

*Why?* Enables automated log analysis, better filtering, and correlation with traces and metrics.

**Example:**
```typescript
// logger.service.ts
import { Injectable, LoggerService } from '@nestjs/common';
import { createLogger, format, transports } from 'winston';

@Injectable()
export class AppLogger implements LoggerService {
  private logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.json(),
      format.printf(({ timestamp, level, message, ...meta }) => {
        return JSON.stringify({
          '@timestamp': timestamp,
          level,
          message,
          service: process.env.SERVICE_NAME,
          environment: process.env.NODE_ENV,
          traceId: meta.traceId,
          spanId: meta.spanId,
          userId: meta.userId,
          ...meta,
        });
      })
    ),
    transports: [
      new transports.Console(),
      new transports.File({ filename: 'app.log' }),
    ],
  });

  log(message: string, context?: any) {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: any) {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: any) {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: any) {
    this.logger.debug(message, { context });
  }
}
```

**Never log sensitive information.**  
Implement data sanitization for logs to prevent security breaches.  

*Why?* Protects user privacy and prevents exposure of credentials, PII, or business-sensitive data.

**Example:**
```typescript
// logging.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, query } = request;
    
    // Sanitize sensitive data
    const sanitizedBody = this.sanitizeData(body);
    const sanitizedQuery = this.sanitizeData(query);
    
    console.log({
      type: 'http_request',
      method,
      url,
      body: sanitizedBody,
      query: sanitizedQuery,
      timestamp: new Date().toISOString(),
    });

    return next.handle().pipe(
      tap((response) => {
        console.log({
          type: 'http_response',
          method,
          url,
          statusCode: context.switchToHttp().getResponse().statusCode,
          responseTime: Date.now() - request.startTime,
        });
      })
    );
  }

  private sanitizeData(data: any): any {
    if (!data) return data;
    
    const sensitiveFields = ['password', 'token', 'secret', 'authorization', 'cookie'];
    const sanitized = { ...data };
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
}
```

## Application Performance Monitoring

**Monitor Node.js specific metrics.**  
Track event loop lag, memory usage, and garbage collection performance.  

*Why?* Node.js performance issues often stem from event loop blocking and memory leaks.

**Example:**
```typescript
// metrics.service.ts
import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import * as process from 'process';

@Injectable()
export class MetricsService {
  private meter = metrics.getMeter('app-metrics');
  private eventLoopLagHistogram = this.meter.createHistogram('event_loop_lag_ms');
  private memoryUsageGauge = this.meter.createUpDownCounter('memory_usage_bytes');
  private httpRequestCounter = this.meter.createCounter('http_requests_total');
  private httpRequestDuration = this.meter.createHistogram('http_request_duration_ms');

  constructor() {
    this.startMetricsCollection();
  }

  private startMetricsCollection() {
    // Event loop lag monitoring
    setInterval(() => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000;
        this.eventLoopLagHistogram.record(lag);
      });
    }, 5000);

    // Memory usage monitoring
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.memoryUsageGauge.add(memUsage.heapUsed, { type: 'heap_used' });
      this.memoryUsageGauge.add(memUsage.heapTotal, { type: 'heap_total' });
      this.memoryUsageGauge.add(memUsage.rss, { type: 'rss' });
    }, 10000);
  }

  recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
    this.httpRequestCounter.add(1, {
      method,
      route,
      status_code: statusCode.toString(),
    });
    
    this.httpRequestDuration.record(duration, {
      method,
      route,
      status_code: statusCode.toString(),
    });
  }

  recordBusinessMetric(name: string, value: number, attributes?: Record<string, string>) {
    const counter = this.meter.createCounter(`business_${name}`);
    counter.add(value, attributes);
  }
}
```

**Implement database query monitoring.**  
Track database performance and slow queries automatically.  

*Why?* Database issues are often the primary cause of application performance problems.

**Example:**
```typescript
// database-monitoring.interceptor.ts
import { Injectable } from '@nestjs/common';
import { Connection } from 'mongoose';

@Injectable()
export class DatabaseMonitoringService {
  constructor(private connection: Connection) {
    this.setupMonitoring();
  }

  private setupMonitoring() {
    // Monitor MongoDB operations
    this.connection.on('command', (event) => {
      const startTime = Date.now();
      
      this.connection.on('commandSucceeded', (successEvent) => {
        if (successEvent.requestId === event.requestId) {
          const duration = Date.now() - startTime;
          
          console.log({
            type: 'database_operation',
            operation: event.commandName,
            collection: event.command?.find || event.command?.insert,
            duration,
            success: true,
          });

          // Alert on slow queries
          if (duration > 1000) {
            console.warn({
              type: 'slow_query_detected',
              operation: event.commandName,
              duration,
              query: this.sanitizeQuery(event.command),
            });
          }
        }
      });

      this.connection.on('commandFailed', (failEvent) => {
        if (failEvent.requestId === event.requestId) {
          console.error({
            type: 'database_operation',
            operation: event.commandName,
            duration: Date.now() - startTime,
            success: false,
            error: failEvent.failure,
          });
        }
      });
    });
  }

  private sanitizeQuery(command: any): any {
    // Remove sensitive data from query logs
    const sanitized = { ...command };
    if (sanitized.password) delete sanitized.password;
    if (sanitized.token) delete sanitized.token;
    return sanitized;
  }
}
```

## Error Tracking & Alerting

**Implement comprehensive error tracking.**  
Use Sentry or similar tools for automatic error collection and alerting.  

*Why?* Proactive error detection prevents issues from affecting users and enables faster resolution.

**Example:**
```typescript
// error-tracking.service.ts
import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ErrorTrackingService {
  constructor(private configService: ConfigService) {
    Sentry.init({
      dsn: this.configService.get('SENTRY_DSN'),
      environment: this.configService.get('NODE_ENV'),
      tracesSampleRate: this.configService.get('NODE_ENV') === 'production' ? 0.1 : 1.0,
      beforeSend(event) {
        // Filter out sensitive information
        if (event.request?.data) {
          event.request.data = this.sanitizeData(event.request.data);
        }
        return event;
      },
    });
  }

  captureException(error: Error, context?: any) {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setContext('additional_info', context);
      }
      Sentry.captureException(error);
    });
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    Sentry.captureMessage(message, level);
  }

  setUser(user: { id: string; email?: string }) {
    Sentry.setUser(user);
  }

  private sanitizeData(data: any): any {
    const sensitiveFields = ['password', 'token', 'secret'];
    const sanitized = { ...data };
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
}
```

## Health Checks & Readiness Probes

**Implement comprehensive health checks.**  
Create health endpoints for application and dependency status monitoring.  

*Why?* Essential for load balancers, orchestrators, and monitoring systems to determine service health.

**Example:**
```typescript
// health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MongooseHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private mongoose: MongooseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.mongoose.pingCheck('database'),
      () => this.checkExternalServices(),
      () => this.checkMemoryUsage(),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.mongoose.pingCheck('database'),
      () => this.checkCriticalServices(),
    ]);
  }

  @Get('live')
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  private async checkExternalServices() {
    try {
      // Check external API availability
      const response = await fetch('https://api.external-service.com/health', {
        timeout: 5000,
      });
      
      return {
        external_service: {
          status: response.ok ? 'up' : 'down',
          responseTime: response.headers.get('response-time'),
        },
      };
    } catch (error) {
      throw new Error(`External service check failed: ${error.message}`);
    }
  }

  private async checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const memoryThreshold = 1024 * 1024 * 512; // 512MB

    if (memUsage.heapUsed > memoryThreshold) {
      throw new Error(`High memory usage: ${memUsage.heapUsed / 1024 / 1024}MB`);
    }

    return {
      memory: {
        status: 'ok',
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      },
    };
  }

  private async checkCriticalServices() {
    // Add checks for services critical for application startup
    return { critical_services: { status: 'ok' } };
  }
}
```

## Monitoring Tool Selection

**Choose monitoring solutions based on scale and budget.**  
Select appropriate tools based on team size, traffic, and budget constraints.  

*Why?* Different solutions offer varying cost-to-value ratios depending on organizational needs.

**Startup/Small Teams (< 10 people):**
- **Sentry** for error tracking (free tier available)
- **Better Stack** for logs and uptime monitoring ($7/month)
- **Grafana Cloud** free tier for metrics
- **OpenTelemetry + Jaeger** self-hosted for tracing

**Scale-up Teams (10-50 people):**
- **Datadog** for comprehensive APM ($15-23/host/month)
- **New Relic** for application monitoring ($25/month per 100GB)
- **Elastic APM** for full observability stack
- **CubeAPM** for cost-effective alternative ($0.15/GB)

**Enterprise (50+ people):**
- **Datadog Enterprise** with custom pricing
- **Dynatrace** for AI-powered monitoring
- **Splunk** for enterprise logging and analytics
- **AppDynamics** for business-centric monitoring

## Security Monitoring

**Implement security audit logging.**  
Track authentication, authorization, and sensitive operations for security analysis.  

*Why?* Essential for compliance, security incident response, and threat detection.

**Example:**
```typescript
// security-audit.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class SecurityAuditService {
  auditLogin(userId: string, ip: string, userAgent: string, success: boolean) {
    console.log({
      type: 'security_audit',
      event: 'user_login',
      userId,
      ip,
      userAgent,
      success,
      timestamp: new Date().toISOString(),
      severity: success ? 'info' : 'warning',
    });
  }

  auditSensitiveOperation(userId: string, operation: string, resourceId: string) {
    console.log({
      type: 'security_audit',
      event: 'sensitive_operation',
      userId,
      operation,
      resourceId,
      timestamp: new Date().toISOString(),
      severity: 'info',
    });
  }

  auditFailedAuthorization(userId: string, resource: string, action: string) {
    console.log({
      type: 'security_audit',
      event: 'authorization_failed',
      userId,
      resource,
      action,
      timestamp: new Date().toISOString(),
      severity: 'warning',
    });
  }

  auditRateLimitExceeded(ip: string, endpoint: string) {
    console.log({
      type: 'security_audit',
      event: 'rate_limit_exceeded',
      ip,
      endpoint,
      timestamp: new Date().toISOString(),
      severity: 'warning',
    });
  }
}
```

## Performance Budgets & SLIs/SLOs

**Define Service Level Indicators and Objectives.**  
Establish measurable targets for application performance and reliability.  

*Why?* Provides clear performance targets and enables data-driven decision making for infrastructure investments.

**Example:**
```typescript
// sli-slo.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class SliSloService {
  private slis = {
    availability: {
      target: 99.9, // 99.9% uptime SLO
      current: 0,
    },
    latency: {
      target: 200, // 95th percentile < 200ms SLO
      current: 0,
    },
    errorRate: {
      target: 1, // < 1% error rate SLO
      current: 0,
    },
  };

  calculateAvailability(totalRequests: number, errorRequests: number): number {
    return ((totalRequests - errorRequests) / totalRequests) * 100;
  }

  checkSloCompliance(): { [key: string]: boolean } {
    return {
      availability: this.slis.availability.current >= this.slis.availability.target,
      latency: this.slis.latency.current <= this.slis.latency.target,
      errorRate: this.slis.errorRate.current <= this.slis.errorRate.target,
    };
  }

  generateErrorBudget(): { [key: string]: number } {
    const monthlyMinutes = 30 * 24 * 60; // 43,200 minutes per month
    const allowedDowntime = monthlyMinutes * (1 - this.slis.availability.target / 100);
    
    return {
      totalErrorBudgetMinutes: allowedDowntime,
      remainingErrorBudgetMinutes: allowedDowntime - this.calculateCurrentDowntime(),
    };
  }

  private calculateCurrentDowntime(): number {
    // Calculate current month's downtime based on actual metrics
    return 0; // Implement based on your metrics collection
  }
}
```