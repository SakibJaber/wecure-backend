import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Doctor.name, schema: DoctorSchema },
      { name: DoctorService.name, schema: DoctorServiceSchema },
      { name: DoctorExperience.name, schema: DoctorExperienceSchema },
    ]),
  ],
  controllers: [DoctorsController],
  providers: [DoctorsService],
  exports: [DoctorsService],
})
export class DoctorsModule {}
