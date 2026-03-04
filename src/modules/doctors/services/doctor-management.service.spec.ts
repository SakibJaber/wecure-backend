import { Test, TestingModule } from '@nestjs/testing';
import { DoctorManagementService } from './doctor-management.service';
import { getModelToken } from '@nestjs/mongoose';
import { Doctor } from '../schemas/doctor.schema';
import { DoctorService } from '../schemas/doctor-service.schema';
import { DoctorExperience } from '../schemas/doctor-experience.schema';
import { Review } from '../../reviews/schemas/review.schema';
import { UploadsService } from '../../uploads/uploads.service';
import { AvailabilityService } from '../../availability/availability.service';
import { AppointmentManagerService } from '../../appointments/services/appointment-manager.service';
import { UsersService } from '../../users/users.service';
import { PublicUploadService } from '../../public-upload/public-upload.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EncryptionService } from 'src/common/services/encryption.service';
import { NotFoundException } from '@nestjs/common';

describe('DoctorManagementService', () => {
  let service: DoctorManagementService;
  let doctorModel: any;
  let encryptionService: EncryptionService;

  const mockDoctor = {
    _id: 'doctor123',
    userId: 'user123',
    bankName: '32hexcharsiv:encryptedbank',
    accountName: '32hexcharsiv:encryptedname',
    accountNumber: '32hexcharsiv:encryptednumber',
  };

  const mockDoctorModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn((text) => `32hexcharsiv:encrypted${text}`),
    decrypt: jest.fn((text) => text.replace('32hexcharsiv:encrypted', '')),
    isEncrypted: jest.fn((text) => text.startsWith('32hexcharsiv:')),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorManagementService,
        {
          provide: getModelToken(Doctor.name),
          useValue: mockDoctorModel,
        },
        {
          provide: getModelToken(DoctorService.name),
          useValue: {},
        },
        {
          provide: getModelToken(DoctorExperience.name),
          useValue: {},
        },
        {
          provide: getModelToken(Review.name),
          useValue: {},
        },
        {
          provide: UploadsService,
          useValue: {},
        },
        {
          provide: AvailabilityService,
          useValue: {},
        },
        {
          provide: AppointmentManagerService,
          useValue: {},
        },
        {
          provide: UsersService,
          useValue: {},
        },
        {
          provide: PublicUploadService,
          useValue: {},
        },
        {
          provide: NotificationsService,
          useValue: {},
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
      ],
    }).compile();

    service = module.get<DoctorManagementService>(DoctorManagementService);
    doctorModel = module.get(getModelToken(Doctor.name));
    encryptionService = module.get<EncryptionService>(EncryptionService);
  });

  describe('getBankDetails', () => {
    it('should return decrypted bank details for doctor', async () => {
      mockDoctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockDoctor),
      });

      const result = await service.getBankDetails('user123');

      expect(result).toEqual({
        bankName: 'bank',
        accountName: 'name',
        accountNumber: 'number',
      });
      expect(mockDoctorModel.findOne).toHaveBeenCalledWith({
        userId: 'user123',
      });
      expect(mockEncryptionService.decrypt).toHaveBeenCalledTimes(3);
    });

    it('should throw NotFoundException if doctor profile not found', async () => {
      mockDoctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getBankDetails('user123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
