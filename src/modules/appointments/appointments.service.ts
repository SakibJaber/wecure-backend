import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Appointment, AppointmentDocument } from './schemas/appointment.schema';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { EncryptionService } from 'src/common/services/encryption.service';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(createAppointmentDto: CreateAppointmentDto) {
    const encryptedReason = this.encryptionService.encrypt(
      createAppointmentDto.reasonDetails,
    );
    const appointment = new this.appointmentModel({
      ...createAppointmentDto,
      reasonDetails: encryptedReason,
    });
    return appointment.save();
  }

  async findAll(userId?: string, role?: string) {
    const query: any = {};
    if (role !== 'ADMIN') {
      if (role === 'DOCTOR') {
        query.doctorId = new Types.ObjectId(userId);
      } else {
        query.userId = new Types.ObjectId(userId);
      }
    }
    const appointments = await this.appointmentModel.find(query).lean();
    return appointments.map((app) => ({
      ...app,
      reasonDetails: this.encryptionService.decrypt(app.reasonDetails),
    }));
  }

  async findOne(id: string, userId: string, role: string) {
    const appointment = await this.appointmentModel.findById(id).lean();
    if (!appointment) throw new NotFoundException('Appointment not found');

    if (
      role !== 'ADMIN' &&
      appointment.userId.toString() !== userId &&
      appointment.doctorId.toString() !== userId
    ) {
      throw new ForbiddenException('Access denied');
    }

    return {
      ...appointment,
      reasonDetails: this.encryptionService.decrypt(appointment.reasonDetails),
    };
  }

  async update(
    id: string,
    updateAppointmentDto: UpdateAppointmentDto,
    userId: string,
    role: string,
  ) {
    const appointment = await this.appointmentModel.findById(id);
    if (!appointment) throw new NotFoundException('Appointment not found');

    if (role !== 'ADMIN' && appointment.userId.toString() !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (updateAppointmentDto.reasonDetails) {
      updateAppointmentDto.reasonDetails = this.encryptionService.encrypt(
        updateAppointmentDto.reasonDetails,
      );
    }

    Object.assign(appointment, updateAppointmentDto);
    return appointment.save();
  }

  async remove(id: string, userId: string, role: string) {
    const appointment = await this.appointmentModel.findById(id);
    if (!appointment) throw new NotFoundException('Appointment not found');

    if (role !== 'ADMIN' && appointment.userId.toString() !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return this.appointmentModel.findByIdAndDelete(id);
  }
}
