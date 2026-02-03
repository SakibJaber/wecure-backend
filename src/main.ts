import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { SecurityExceptionFilter } from './common/filters/security-exception.filter';
import { AuditLogsService } from './modules/audit-logs/audit-logs.service';
import helmet from 'helmet';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Security Headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow embedding for development
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  //   Global prefix
  app.setGlobalPrefix('api');

  //   Global Interceptors & Filters
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Resolve AuditLogsService to inject into SecurityExceptionFilter
  const auditLogsService = app.get(AuditLogsService);
  app.useGlobalFilters(
    new HttpExceptionFilter(),
    new SecurityExceptionFilter(auditLogsService),
  );

  //   Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  //  CORS
  const allowlist = [
    'http://localhost:3000',
    'http://localhost:3030',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174',
  ];

  app.enableCors({
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return cb(null, true);

      // Allow all origins in development mode
      if (process.env.NODE_ENV === 'development') {
        return cb(null, true);
      }

      if (allowlist.includes(origin) || allowlist.includes('*')) {
        return cb(null, true);
      }

      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
