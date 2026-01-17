import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { Appointment, AppointmentSchema } from './schemas/appointment.schema';
import {
  AppointmentAttachment,
  AppointmentAttachmentSchema,
} from './schemas/attachment.schema';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { AvailabilityModule } from '../availability/availability.module';
import { DoctorsModule } from '../doctors/doctors.module';

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
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
