import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentSchedulerService } from './appointment.scheduler';
import { AppointmentReminderScheduler } from './appointment-reminder.scheduler';
import { Appointment, AppointmentSchema } from './schemas/appointment.schema';
import {
  AppointmentAttachment,
  AppointmentAttachmentSchema,
} from './schemas/attachment.schema';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { AvailabilityModule } from '../availability/availability.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { AgoraModule } from '../agora/agora.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Appointment.name, schema: AppointmentSchema },
      {
        name: AppointmentAttachment.name,
        schema: AppointmentAttachmentSchema,
      },
      { name: Doctor.name, schema: DoctorSchema },
    ]),
    AvailabilityModule,
    DoctorsModule,
    AgoraModule,
  ],
  controllers: [AppointmentsController],
  providers: [
    AppointmentsService,
    AppointmentSchedulerService,
    AppointmentReminderScheduler,
  ],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
