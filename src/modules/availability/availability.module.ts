import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import {
  DoctorAvailability,
  DoctorAvailabilitySchema,
} from './schemas/availability.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: DoctorAvailability.name,
        schema: DoctorAvailabilitySchema,
      },
    ]),
  ],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
