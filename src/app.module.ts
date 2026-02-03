import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DomainModule } from './modules/domain.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { databaseConfig } from './config/database.config';
import { CommonModule } from './common/common.module';
import { awsConfig } from 'src/config/aws.config';
import { appConfig } from './config/app.config';
import { AgoraModule } from './modules/agora/agora.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SeederModule } from './modules/seeder/seeder.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { throttlerConfig } from './config/throttler.config';

const logger = new Logger('Database');

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
    DomainModule,
    AuditLogsModule,
    CommonModule,
    AgoraModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    NotificationsModule,
    SeederModule,
    ThrottlerModule.forRoot(throttlerConfig()),
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
