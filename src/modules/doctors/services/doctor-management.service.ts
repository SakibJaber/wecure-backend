import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Doctor, DoctorDocument } from '../schemas/doctor.schema';
import {
  DoctorService,
  DoctorServiceDocument,
} from '../schemas/doctor-service.schema';
import {
  DoctorExperience,
  DoctorExperienceDocument,
} from '../schemas/doctor-experience.schema';
import { Review, ReviewDocument } from '../../reviews/schemas/review.schema';
import { UploadsService } from '../../uploads/uploads.service';
import { AvailabilityService } from '../../availability/availability.service';
import { AppointmentManagerService } from '../../appointments/services/appointment-manager.service';
import { UsersService } from '../../users/users.service';
import { PublicUploadService } from '../../public-upload/public-upload.service';
import { UPLOAD_FOLDERS } from 'src/common/constants/constants';
import { NotificationsService } from '../../notifications/notifications.service';
import { EncryptionService } from 'src/common/services/encryption.service';
import { AddBankDetailsDto } from '../dto/add-bank-details.dto';

@Injectable()
export class DoctorManagementService {
  constructor(
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
    @InjectModel(DoctorService.name)
    private doctorServiceModel: Model<DoctorServiceDocument>,
    @InjectModel(DoctorExperience.name)
    private doctorExperienceModel: Model<DoctorExperienceDocument>,
    @InjectModel(Review.name)
    private reviewModel: Model<ReviewDocument>,

    private readonly uploadsService: UploadsService,
    @Inject(forwardRef(() => AvailabilityService))
    private readonly availabilityService: AvailabilityService,

    @Inject(forwardRef(() => AppointmentManagerService))
    private readonly appointmentManagerService: AppointmentManagerService,

    private readonly usersService: UsersService,
    private readonly publicUploadService: PublicUploadService,
    private readonly notificationsService: NotificationsService,
    private readonly encryptionService: EncryptionService,
  ) {}

  // ---------- Doctor Profile ----------
  async createProfile(userId: string, dto: any) {
    const exists = await this.doctorModel.findOne({ userId });
    if (exists) throw new ForbiddenException('Doctor profile already exists');

    const { phone, ...doctorData } = dto;
    if (phone) {
      await this.usersService.updateProfile(userId, { phone });
    }

    return this.doctorModel.create({
      userId,
      ...doctorData,
    });
  }

  async updateProfile(userId: string, dto: any, file?: Express.Multer.File) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const { phone, ...doctorData } = dto;

    const userUpdate: any = {};
    if (file) {
      const imageUrl = await this.publicUploadService.handleUpload(
        file,
        UPLOAD_FOLDERS.USER_PROFILES,
      );
      userUpdate.profileImage = imageUrl;
    }

    if (phone) {
      userUpdate.phone = phone;
    }

    if (Object.keys(userUpdate).length > 0) {
      await this.usersService.updateProfile(userId, userUpdate);
    }

    return this.doctorModel
      .findByIdAndUpdate(doctor._id, doctorData, { new: true })
      .populate('userId', 'name email phone profileImage')
      .populate('specialtyId', 'name');
  }

  async getMyProfile(userId: string) {
    const doctor = await this.doctorModel
      .findOne({ userId })
      .populate('userId', 'name profileImage')
      .populate('specialtyId', 'name')
      .lean();
    if (!doctor) return null;

    if (
      doctor.verificationDocuments &&
      doctor.verificationDocuments.length > 0
    ) {
      doctor.verificationDocuments = await Promise.all(
        doctor.verificationDocuments.map((key) =>
          this.uploadsService.generateViewUrl(key, userId),
        ),
      );
    }

    // Add total experience years
    const experiences = await this.doctorExperienceModel.find({
      doctorId: doctor._id,
    });
    (doctor as any).totalExperienceYears =
      this.calculateTotalExperience(experiences);

    // Decrypt bank details if they exist
    if (doctor.bankName) {
      doctor.bankName = this.encryptionService.isEncrypted(doctor.bankName)
        ? this.encryptionService.decrypt(doctor.bankName)
        : doctor.bankName;
    }
    if (doctor.accountName) {
      doctor.accountName = this.encryptionService.isEncrypted(
        doctor.accountName,
      )
        ? this.encryptionService.decrypt(doctor.accountName)
        : doctor.accountName;
    }
    if (doctor.accountNumber) {
      doctor.accountNumber = this.encryptionService.isEncrypted(
        doctor.accountNumber,
      )
        ? this.encryptionService.decrypt(doctor.accountNumber)
        : doctor.accountNumber;
    }

    // Add services
    (doctor as any).services = await this.doctorServiceModel
      .find({
        doctorId: doctor._id,
      })
      .lean();

    // Add average rating
    const [ratingStats] = await this.reviewModel.aggregate([
      {
        $match: {
          $or: [{ doctorId: doctor._id }, { doctorId: doctor._id.toString() }],
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          average: { $avg: '$rating' },
        },
      },
    ]);

    (doctor as any).averageRating =
      (ratingStats?.total || 0) > 0
        ? parseFloat((ratingStats.average || 0).toFixed(1))
        : 0;

    return doctor;
  }

  async addBankDetails(userId: string, dto: AddBankDetailsDto) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const updateData = {
      bankName: this.encryptionService.encrypt(dto.bankName),
      accountName: this.encryptionService.encrypt(dto.accountName),
      accountNumber: this.encryptionService.encrypt(dto.accountNumber),
    };

    return this.doctorModel.findByIdAndUpdate(doctor._id, updateData, {
      new: true,
    });
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

    const experience = await this.doctorExperienceModel.create({
      doctorId: doctor._id,
      ...dto,
    });

    // Recalculate and update doctor's total experience years
    const experiences = await this.doctorExperienceModel.find({
      doctorId: doctor._id,
    });
    const totalYears = this.calculateTotalExperience(experiences);
    await this.doctorModel.findByIdAndUpdate(doctor._id, {
      experienceYears: totalYears,
    });

    return experience;
  }

  async listExperiences(doctorId: string) {
    return this.doctorExperienceModel
      .find({ doctorId })
      .sort({ isCurrent: -1, startDate: -1 })
      .lean();
  }

  calculateTotalExperience(experiences: any[]): number {
    if (!experiences || experiences.length === 0) return 0;

    let totalMonths = 0;
    const now = new Date();

    experiences.forEach((exp) => {
      const start = new Date(exp.startDate);
      const end = exp.isCurrent || !exp.endDate ? now : new Date(exp.endDate);

      const diffMonths =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth());

      if (diffMonths > 0) {
        totalMonths += diffMonths;
      }
    });

    return Math.floor(totalMonths / 12);
  }

  // ---------- Verification ----------
  async uploadVerificationDocuments(
    userId: string,
    files: Express.Multer.File[],
  ) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const uploadPromises = files.map((file) =>
      this.uploadsService.uploadBuffer(
        file.buffer,
        file.mimetype,
        'verifications',
        file.originalname,
        userId,
      ),
    );

    const documentKeys = await Promise.all(uploadPromises);

    doctor.verificationDocuments.push(...documentKeys);
    await doctor.save();
    return doctor;
  }

  async updateVerificationStatus(
    doctorId: string,
    status: string,
    note?: string,
  ) {
    const doctor = await this.doctorModel
      .findById(doctorId)
      .populate('userId', 'name email');
    if (!doctor) throw new NotFoundException('Doctor not found');

    const previousStatus = doctor.verificationStatus;
    const user = doctor.userId as any;

    const updateData: any = {
      verificationStatus: status,
      verificationNote: note || '',
    };

    // Update isVerified for backward compatibility
    if (status === 'VERIFIED') {
      updateData.isVerified = true;
    } else {
      updateData.isVerified = false;
    }

    const updatedDoctor = await this.doctorModel.findByIdAndUpdate(
      doctorId,
      updateData,
      { new: true },
    );

    // Emit events for notifications (replaces direct mail calls)
    if (user) {
      if (status === 'VERIFIED') {
        if (previousStatus === 'SUSPENDED') {
          this.notificationsService.emit('doctor.unsuspended', {
            doctorId,
            userId: user._id,
            email: user.email,
            name: user.name,
          });
        } else if (previousStatus !== 'VERIFIED') {
          this.notificationsService.emit('doctor.verified', {
            doctorId,
            userId: user._id,
            email: user.email,
            name: user.name,
          });
        }
      } else if (status === 'REJECTED') {
        this.notificationsService.emit('doctor.rejected', {
          doctorId,
          userId: user._id,
          email: user.email,
          name: user.name,
          note,
        });
        // Side effects (non-blocking)
        this.availabilityService.deactivateAllForDoctor(doctorId);
        this.appointmentManagerService.cancelUpcomingForDoctor(doctorId);
      } else if (status === 'SUSPENDED') {
        this.notificationsService.emit('doctor.suspended', {
          doctorId,
          userId: user._id,
          email: user.email,
          name: user.name,
          note,
        });
        // Side effects (non-blocking)
        this.availabilityService.deactivateAllForDoctor(doctorId);
        this.appointmentManagerService.cancelUpcomingForDoctor(doctorId);
      }
    }

    return updatedDoctor;
  }
}
