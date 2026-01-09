import { Module } from '@nestjs/common';
import { WellnessTipsService } from './wellness-tips.service';
import { WellnessTipsController } from './wellness-tips.controller';

@Module({
  controllers: [WellnessTipsController],
  providers: [WellnessTipsService],
})
export class WellnessTipsModule {}
