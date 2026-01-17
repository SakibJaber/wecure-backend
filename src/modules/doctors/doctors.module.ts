import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';
import { Doctor, DoctorSchema } from './schemas/doctor.schema';
import {
  DoctorService,
  DoctorServiceSchema,
} from './schemas/doctor-service.schema';
import {
  DoctorExperience,
  DoctorExperienceSchema,
} from './schemas/doctor-experience.schema';
import { AvailabilityModule } from '../availability/availability.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Doctor.name, schema: DoctorSchema },
      { name: DoctorService.name, schema: DoctorServiceSchema },
      { name: DoctorExperience.name, schema: DoctorExperienceSchema },
    ]),
    forwardRef(() => AvailabilityModule),
    forwardRef(() => AppointmentsModule),
    MailModule,
  ],
  controllers: [DoctorsController],
  providers: [DoctorsService],
  exports: [DoctorsService, MongooseModule],
})
export class DoctorsModule {}
