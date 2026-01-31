import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { getModelToken } from '@nestjs/mongoose';
import { Appointment } from './schemas/appointment.schema';
import { AppointmentAttachment } from './schemas/attachment.schema';
import { Doctor } from '../doctors/schemas/doctor.schema';
import { AvailabilityService } from '../availability/availability.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('AppointmentsService - Availability', () => {
  let service: AppointmentsService;
  let availabilityService: AvailabilityService;
  let doctorModel: any;
  let appointmentModel: any;

  const mockDoctorId = new Types.ObjectId();
  const mockUserId = new Types.ObjectId();
  const mockSpecialistId = new Types.ObjectId();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        {
          provide: getModelToken(Appointment.name),
          useValue: {
            create: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            countDocuments: jest.fn(),
          },
        },
        {
          provide: getModelToken(AppointmentAttachment.name),
          useValue: {},
        },
        {
          provide: getModelToken(Doctor.name),
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: AvailabilityService,
          useValue: {
            getByDoctor: jest.fn(),
          },
        },
        {
          provide: 'DatabaseConnection', // This is for @InjectConnection()
          useValue: {
            startSession: jest.fn().mockResolvedValue({
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              abortTransaction: jest.fn(),
              endSession: jest.fn(),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    availabilityService = module.get<AvailabilityService>(AvailabilityService);
    doctorModel = module.get(getModelToken(Doctor.name));
    appointmentModel = module.get(getModelToken(Appointment.name));
  });

  it('should throw BadRequestException if appointment date is in the past', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1); // Yesterday

    const dto = {
      doctorId: mockDoctorId.toString(),
      specialistId: mockSpecialistId.toString(),
      appointmentDate: pastDate.toISOString(),
      appointmentTime: '10:00',
    };

    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: mockDoctorId }),
    });

    await expect(
      service.create(mockUserId.toString(), dto as any),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create(mockUserId.toString(), dto as any),
    ).rejects.toThrow('Cannot book appointments in the past');
  });

  it('should throw BadRequestException if doctor has no availability', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

    const dto = {
      doctorId: mockDoctorId.toString(),
      specialistId: mockSpecialistId.toString(),
      appointmentDate: futureDate.toISOString(),
      appointmentTime: '10:00',
    };

    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: mockDoctorId }),
    });
    (availabilityService.getByDoctor as jest.Mock).mockResolvedValue([]);

    await expect(
      service.create(mockUserId.toString(), dto as any),
    ).rejects.toThrow('Doctor has no availability configured');
  });

  it('should throw BadRequestException if doctor is not available on that day', async () => {
    // Let's assume tomorrow is NOT Monday (or whatever we mock)
    // To be safe, let's pick a specific date.
    // 2026-01-20 is a Tuesday.
    const specificDate = new Date('2026-01-20T00:00:00Z');

    const dto = {
      doctorId: mockDoctorId.toString(),
      specialistId: mockSpecialistId.toString(),
      appointmentDate: specificDate.toISOString(),
      appointmentTime: '10:00',
    };

    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: mockDoctorId }),
    });
    (availabilityService.getByDoctor as jest.Mock).mockResolvedValue([
      {
        dayOfWeek: 'MONDAY',
        isActive: true,
        startTime: '09:00',
        endTime: '17:00',
      },
    ]);

    await expect(
      service.create(mockUserId.toString(), dto as any),
    ).rejects.toThrow('Doctor is not available on TUESDAY');
  });

  it('should throw BadRequestException if time is outside range', async () => {
    // 2026-01-19 is a Monday.
    const specificDate = new Date('2026-01-19T00:00:00Z');

    const dto = {
      doctorId: mockDoctorId.toString(),
      specialistId: mockSpecialistId.toString(),
      appointmentDate: specificDate.toISOString(),
      appointmentTime: '18:00', // Outside 09:00-17:00
    };

    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: mockDoctorId }),
    });
    (availabilityService.getByDoctor as jest.Mock).mockResolvedValue([
      {
        dayOfWeek: 'MONDAY',
        isActive: true,
        startTime: '09:00',
        endTime: '17:00',
      },
    ]);

    await expect(
      service.create(mockUserId.toString(), dto as any),
    ).rejects.toThrow('Appointment time must be between 09:00 and 17:00');
  });

  it('should throw BadRequestException if time overlaps with existing appointment', async () => {
    // 2026-01-19 is a Monday.
    const specificDate = new Date('2026-01-19T00:00:00Z');

    const dto = {
      doctorId: mockDoctorId.toString(),
      specialistId: mockSpecialistId.toString(),
      appointmentDate: specificDate.toISOString(),
      appointmentTime: '11:40', // Overlaps with 11:30-12:00
    };

    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: mockDoctorId }),
    });
    (availabilityService.getByDoctor as jest.Mock).mockResolvedValue([
      {
        dayOfWeek: 'MONDAY',
        isActive: true,
        startTime: '09:00',
        endTime: '17:00',
      },
    ]);

    appointmentModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        appointmentTime: '11:30',
        appointmentEndTime: '12:00',
      }),
    });

    await expect(
      service.create(mockUserId.toString(), dto as any),
    ).rejects.toThrow(
      'This time slot overlaps with an existing appointment (11:30 - 12:00)',
    );
  });

  it('should create appointment if all checks pass', async () => {
    // 2026-01-19 is a Monday.
    const specificDate = new Date('2026-01-19T00:00:00Z');

    const dto = {
      doctorId: mockDoctorId.toString(),
      specialistId: mockSpecialistId.toString(),
      appointmentDate: specificDate.toISOString(),
      appointmentTime: '10:00',
      reasonTitle: 'Checkup',
    };

    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        _id: mockDoctorId,
      }),
    });
    (availabilityService.getByDoctor as jest.Mock).mockResolvedValue([
      {
        dayOfWeek: 'MONDAY',
        isActive: true,
        startTime: '09:00',
        endTime: '17:00',
        fee: 100,
      },
    ]);
    appointmentModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    appointmentModel.create.mockResolvedValue([{ _id: 'new-appt-id' }]);

    const result = await service.create(mockUserId.toString(), dto as any);
    expect(result).toEqual({ _id: 'new-appt-id' });
    expect(appointmentModel.create).toHaveBeenCalled();
  });
});
