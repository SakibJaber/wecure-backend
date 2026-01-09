import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DomainModule } from './modules/domain.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { databaseConfig } from './config/database.config';
import { CommonModule } from './common/common.module';

const logger = new Logger('Database');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AppModule {}
