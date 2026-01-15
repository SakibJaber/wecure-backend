import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Doctor, DoctorDocument } from './schemas/doctor.schema';
import {
  DoctorService,
  DoctorServiceDocument,
} from './schemas/doctor-service.schema';
import {
  DoctorExperience,
  DoctorExperienceDocument,
} from './schemas/doctor-experience.schema';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,

    @InjectModel(DoctorService.name)
    private doctorServiceModel: Model<DoctorServiceDocument>,

    @InjectModel(DoctorExperience.name)
    private doctorExperienceModel: Model<DoctorExperienceDocument>,
    private readonly uploadsService: UploadsService,
  ) {}

  // ---------- Doctor Profile ----------
  async createProfile(userId: string, dto: any) {
    const exists = await this.doctorModel.findOne({ userId });
    if (exists) throw new ForbiddenException('Doctor profile already exists');

    return this.doctorModel.create({
      userId,
      ...dto,
    });
  }

  async getMyProfile(userId: string) {
    const doctor = await this.doctorModel.findOne({ userId }).lean();
    if (
      doctor &&
      doctor.verificationDocuments &&
      doctor.verificationDocuments.length > 0
    ) {
      doctor.verificationDocuments = await Promise.all(
        doctor.verificationDocuments.map((key) =>
          this.uploadsService.generateViewUrl(key),
        ),
      );
    }
    return doctor;
  }

  // ---------- Services ----------
  async addService(userId: string, name: string) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    return this.doctorServiceModel.create({
      doctorId: doctor._id,
      name,
    });
  }

  async listServices(doctorId: string) {
    return this.doctorServiceModel.find({ doctorId }).lean();
  }

  async deleteService(userId: string, serviceId: string) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException();

    return this.doctorServiceModel.deleteOne({
      _id: serviceId,
      doctorId: doctor._id,
    });
  }

  // ---------- Experiences ----------
  async addExperience(userId: string, dto: any) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException();

    return this.doctorExperienceModel.create({
      doctorId: doctor._id,
      ...dto,
    });
  }

  async listExperiences(doctorId: string) {
    return this.doctorExperienceModel
      .find({ doctorId })
      .sort({ isCurrent: -1, startDate: -1 })
      .lean();
  }

  async uploadVerificationDocument(userId: string, file: Express.Multer.File) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const documentKey = await this.uploadsService.uploadBuffer(
      file.buffer,
      file.mimetype,
      'verifications',
      file.originalname,
    );

    doctor.verificationDocuments.push(documentKey);
    await doctor.save();
    return doctor;
  }

  async updateVerificationStatus(
    doctorId: string,
    status: string,
    note?: string,
  ) {
    const updateData: any = {
      verificationStatus: status,
    };

    // Update isVerified for backward compatibility
    if (status === 'VERIFIED') {
      updateData.isVerified = true;
    } else {
      updateData.isVerified = false;
    }

    if (note) {
      updateData.verificationNote = note;
    }

    const doctor = await this.doctorModel.findByIdAndUpdate(
      doctorId,
      updateData,
      { new: true },
    );

    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  async getAllDoctorsForAdmin(filters?: any) {
    const query: any = {};

    if (filters?.status) {
      query.verificationStatus = filters.status;
    }

    const doctors = await this.doctorModel
      .find(query)
      .populate('userId', 'name email')
      .populate('specialtyId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // Generate pre-signed URLs for verification documents
    for (const doctor of doctors) {
      if (
        doctor.verificationDocuments &&
        doctor.verificationDocuments.length > 0
      ) {
        doctor.verificationDocuments = await Promise.all(
          doctor.verificationDocuments.map((key) =>
            this.uploadsService.generateViewUrl(key),
          ),
        );
      }
    }

    return doctors;
  }

  async getPublicProfile(doctorId: string) {
    const doctor = await this.doctorModel
      .findOne({ _id: doctorId, isVerified: true })
      .select('-verificationDocuments')
      .populate('specialtyId', 'name')
      .lean();

    if (!doctor) throw new NotFoundException('Doctor not found');

    const services = await this.doctorServiceModel.find({
      doctorId: doctor._id,
    });

    const experiences = await this.doctorExperienceModel
      .find({ doctorId: doctor._id })
      .sort({ isCurrent: -1, startDate: -1 });

    return {
      doctor,
      services,
      experiences,
    };
  }
}
