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

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(DoctorAvailability.name)
    private availabilityModel: Model<AvailabilityDocument>,
  ) {}

  // ---------------- Create ----------------
  async create(
    doctorId: Types.ObjectId,
    dto: CreateAvailabilityDto,
  ) {
    this.validateTimeRange(dto.startTime, dto.endTime, dto.slotSizeMinutes);

    return this.availabilityModel.create({
      doctorId,
      ...dto,
    });
  }

  // ---------------- Get ----------------
  async getByDoctor(doctorId: Types.ObjectId) {
    return this.availabilityModel
      .find({ doctorId })
      .sort({ dayOfWeek: 1 })
      .lean();
  }

  // ---------------- Update ----------------
  async toggleAvailability(
    doctorId: Types.ObjectId,
    availabilityId: string,
    isActive: boolean,
  ) {
    const availability = await this.availabilityModel.findOne({
      _id: availabilityId,
      doctorId,
    });

    if (!availability) {
      throw new NotFoundException('Availability not found');
    }

    availability.isActive = isActive;
    return availability.save();
  }

  // ---------------- Delete ----------------
  async remove(doctorId: Types.ObjectId, availabilityId: string) {
    return this.availabilityModel.deleteOne({
      _id: availabilityId,
      doctorId,
    });
  }

  // ---------------- Slot Generation ----------------
  generateSlots(
    startTime: string,
    endTime: string,
    slotSizeMinutes: number,
  ) {
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
      throw new BadRequestException(
        'Start time must be before end time',
      );
    }

    if ((end - start) < slotSize) {
      throw new BadRequestException(
        'Time range is too small for slot size',
      );
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
