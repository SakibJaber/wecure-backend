import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppointmentFinderService } from './appointment-finder.service';
import { Appointment } from '../schemas/appointment.schema';
import { Doctor } from '../../doctors/schemas/doctor.schema';
import { Review } from '../../reviews/schemas/review.schema';
import { EncryptionService } from 'src/common/services/encryption.service';
import { UploadsService } from '../../uploads/uploads.service';

describe('AppointmentFinderService', () => {
  let service: AppointmentFinderService;
  let appointmentModel: any;
  let encryptionService: EncryptionService;

  const mockUserId = new Types.ObjectId().toString();
  const mockAppointmentId = new Types.ObjectId().toString();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentFinderService,
        {
          provide: getModelToken(Appointment.name),
          useValue: {
            aggregate: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: getModelToken(Doctor.name),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getModelToken(Review.name),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            decrypt: jest.fn((val) => val),
            encrypt: jest.fn((val) => val),
          },
        },
        {
          provide: UploadsService,
          useValue: {
            generateViewUrl: jest.fn().mockResolvedValue('http://mock-url.com'),
          },
        },
      ],
    }).compile();

    service = module.get<AppointmentFinderService>(AppointmentFinderService);
    appointmentModel = module.get(getModelToken(Appointment.name));
    encryptionService = module.get<EncryptionService>(EncryptionService);
  });

  describe('getAppointmentDetails', () => {
    it('should throw NotFoundException if appointment not found', async () => {
      appointmentModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getAppointmentDetails(mockAppointmentId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return enriched appointment details', async () => {
      const mockAppt = {
        _id: mockAppointmentId,
        userId: mockUserId,
        doctorId: { _id: 'doc1', userId: { name: 'Dr. Smith' } },
        specialistId: { name: 'Cardiology' },
        reasonTitle: 'Encrypted Title',
        reasonDetails: 'Encrypted Details',
        attachments: [],
      };

      appointmentModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockAppt),
      });

      // Mock reviews for rating
      const reviewsModel = (service as any).reviewModel;
      reviewsModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ rating: 5 }, { rating: 4 }]),
      });

      const result = await service.getAppointmentDetails(
        mockAppointmentId,
        mockUserId,
      );

      expect(result.reasonTitle).toBe('Encrypted Title');
      expect(result.doctorInfo.rating).toBe(4.5);
      expect(encryptionService.decrypt).toHaveBeenCalledWith('Encrypted Title');
    });
  });

  describe('getForUser', () => {
    it('should call aggregate with correct pipeline', async () => {
      appointmentModel.aggregate.mockResolvedValue([
        {
          metadata: [{ total: 1 }],
          data: [{ _id: 'appt1' }],
        },
      ]);

      const result = await service.getForUser(mockUserId);

      expect(appointmentModel.aggregate).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
