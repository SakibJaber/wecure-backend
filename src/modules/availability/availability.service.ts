import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DoctorAvailability,
  AvailabilityDocument,
} from './schemas/availability.schema';
import { CreateAvailabilityDto } from './dto/create-availability.dto';

import { DoctorsService } from '../doctors/doctors.service';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(DoctorAvailability.name)
    private availabilityModel: Model<AvailabilityDocument>,
    private readonly doctorsService: DoctorsService,
  ) {}

  // ---------------- Create ----------------
  async create(userId: string, dto: CreateAvailabilityDto) {
    const doctor = await this.doctorsService.getMyProfile(userId);
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    this.validateTimeRange(dto.startTime, dto.endTime, dto.slotSizeMinutes);

    const results: any[] = [];
    for (const day of dto.days) {
      // Use upsert to update if exists, or create new
      const result = await this.availabilityModel.findOneAndUpdate(
        { doctorId: doctor._id, dayOfWeek: day },
        {
          doctorId: doctor._id,
          dayOfWeek: day,
          slotSizeMinutes: dto.slotSizeMinutes,
          startTime: dto.startTime,
          endTime: dto.endTime,
          fee: dto.fee,
          isActive: true,
        },
        { upsert: true, new: true },
      );
      results.push(result as any);
    }

    return results;
  }

  // ---------------- Get ----------------
  async getByDoctor(doctorId: Types.ObjectId) {
    return this.availabilityModel
      .find({ doctorId })
      .sort({ dayOfWeek: 1 })
      .lean();
  }

  async getMyAvailability(userId: string) {
    const doctor = await this.doctorsService.getMyProfile(userId);
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }
    return this.getByDoctor(doctor._id);
  }

  // ---------------- Update ----------------
  async toggleAvailability(
    userId: string,
    availabilityId: string,
    isActive: boolean,
  ) {
    const doctor = await this.doctorsService.getMyProfile(userId);
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    const availability = await this.availabilityModel.findOne({
      _id: availabilityId,
      doctorId: doctor._id,
    });

    if (!availability) {
      throw new NotFoundException('Availability not found');
    }

    availability.isActive = isActive;
    return availability.save();
  }

  async deactivateAllForDoctor(doctorId: string) {
    return this.availabilityModel.updateMany(
      { doctorId: new Types.ObjectId(doctorId) },
      { isActive: false },
    );
  }

  // ---------------- Delete ----------------
  async remove(userId: string, availabilityId: string) {
    const doctor = await this.doctorsService.getMyProfile(userId);
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    return this.availabilityModel.deleteOne({
      _id: availabilityId,
      doctorId: doctor._id,
    });
  }

  // ---------------- Slot Generation ----------------
  generateSlots(startTime: string, endTime: string, slotSizeMinutes: number) {
    const slots: string[] = [];

    let current = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);

    while (current + slotSizeMinutes <= end) {
      slots.push(this.minutesToTime(current));
      current += slotSizeMinutes;
    }

    return slots;
  }

  // ---------------- Helpers ----------------
  private validateTimeRange(
    startTime: string,
    endTime: string,
    slotSize: number,
  ) {
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);

    if (start >= end) {
      throw new BadRequestException('Start time must be before end time');
    }

    if (end - start < slotSize) {
      throw new BadRequestException('Time range is too small for slot size');
    }
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60)
      .toString()
      .padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }
}
