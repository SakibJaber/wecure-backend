import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppointmentsController } from './appointments.controller';
import { AppointmentSchedulerService } from './appointment.scheduler';
import { Appointment, AppointmentSchema } from './schemas/appointment.schema';
import {
  AppointmentAttachment,
  AppointmentAttachmentSchema,
} from './schemas/attachment.schema';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { AvailabilityModule } from '../availability/availability.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { AgoraModule } from '../agora/agora.module';
import { UploadsModule } from '../uploads/uploads.module';
import { RefundsModule } from '../refunds/refunds.module';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import { AppointmentFinderService } from 'src/modules/appointments/services/appointment-finder.service';
import { AppointmentManagerService } from 'src/modules/appointments/services/appointment-manager.service';
import { AppointmentValidatorService } from 'src/modules/appointments/services/appointment-validator.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Appointment.name, schema: AppointmentSchema },
      {
        name: AppointmentAttachment.name,
        schema: AppointmentAttachmentSchema,
      },
      { name: Doctor.name, schema: DoctorSchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
    AvailabilityModule,
    DoctorsModule,
    AgoraModule,
    UploadsModule,
    RefundsModule,
  ],
  controllers: [AppointmentsController],
  providers: [
    AppointmentSchedulerService,
    AppointmentValidatorService,
    AppointmentFinderService,
    AppointmentManagerService,
  ],
  exports: [
    AppointmentValidatorService,
    AppointmentFinderService,
    AppointmentManagerService,
  ],
})
export class AppointmentsModule {}
