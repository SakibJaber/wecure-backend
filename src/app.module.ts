import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '@nestjs/cache-manager';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DomainModule } from './modules/domain.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuditLogsService } from './modules/audit-logs/audit-logs.service';
import { UploadsModule } from './modules/uploads/uploads.module';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { databaseConfig } from './config/database.config';
import { cacheConfig } from './config/cache.config';
import { CommonModule } from './common/common.module';
import { awsConfig } from 'src/config/aws.config';
import { appConfig } from './config/app.config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { throttlerConfig } from './config/throttler.config';


const logger = new Logger('Database');
const cacheLogger = new Logger('Cache');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, awsConfig, appConfig],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        ...databaseConfig(),
        connectionFactory: (connection) => {
          if (connection.readyState === 1) {
            logger.log('Database started successfully🚀');
          }

          connection.on('connected', () => {
            logger.log('Database started successfully🚀');
          });

          connection.on('error', (error) => {
            logger.error(`Database connection error: ${error.message}`);
          });

          return connection;
        },
      }),
    }),
    // Cache Module with graceful degradation
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        try {
          const config = cacheConfig();
          cacheLogger.log('Cache module initialized successfully');
          return config;
        } catch (error) {
          cacheLogger.warn(
            `Cache initialization failed: ${error.message}. Application will continue without caching.`,
          );
          // Return minimal config as fallback
          return {
            ttl: 300000, // 5 minutes in ms
            max: 10,
            isGlobal: true,
          };
        }
      },
    }),
    DomainModule,
    AuditLogsModule,
    CommonModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    NotificationsModule,
    ThrottlerModule.forRoot(throttlerConfig()),
    UploadsModule.registerAsync({
      imports: [ConfigModule, AuditLogsModule],
      inject: [ConfigService, AuditLogsService],
      useFactory: (
        configService: ConfigService,
        auditLogsService: AuditLogsService,
      ) => ({
        aws: {
          region: configService.get<string>('aws.region')!,
          accessKeyId: configService.get<string>('aws.accessKeyId')!,
          secretAccessKey: configService.get<string>('aws.secretAccessKey')!,
          bucketName: configService.get<string>('aws.s3.bucketName')!,
        },
        signedUrlExpireSeconds:
          configService.get<number>('aws.s3.signedUrlExpireSeconds') ?? 300,
      }),
      logger: {
        useExisting: AuditLogsService,
      },
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
