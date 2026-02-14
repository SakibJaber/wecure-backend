import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentSchedulerService } from './appointment.scheduler';
import { getModelToken } from '@nestjs/mongoose';
import { Appointment } from './schemas/appointment.schema';
import { AppointmentStatus } from '../../common/enum/appointment-status.enum';
import { NotificationsService } from '../notifications/notifications.service';

describe('Appointment Verification', () => {
  let schedulerService: AppointmentSchedulerService;
  let appointmentModel: any;

  const mockAppointmentModel = {
    updateMany: jest.fn(),
    findById: jest.fn(),
    find: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
  };

  const mockNotificationsService = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentSchedulerService,
        {
          provide: getModelToken(Appointment.name),
          useValue: mockAppointmentModel,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    schedulerService = module.get<AppointmentSchedulerService>(
      AppointmentSchedulerService,
    );
  });

  describe('AppointmentSchedulerService', () => {
    it('should transition UPCOMING to ONGOING', async () => {
      mockAppointmentModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
      await schedulerService.handleAppointmentTransitions();

      expect(mockAppointmentModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AppointmentStatus.UPCOMING,
        }),
        expect.objectContaining({
          $set: { status: AppointmentStatus.ONGOING },
        }),
      );
    });

    it('should transition ONGOING to COMPLETED', async () => {
      mockAppointmentModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
      await schedulerService.handleAppointmentTransitions();

      expect(mockAppointmentModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AppointmentStatus.ONGOING,
        }),
        expect.objectContaining({
          $set: { status: AppointmentStatus.COMPLETED },
        }),
      );
    });

    it('should transition overdue UPCOMING appointments to ONGOING', async () => {
      mockAppointmentModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
      await schedulerService.handleAppointmentTransitions();

      expect(mockAppointmentModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AppointmentStatus.UPCOMING,
          $or: expect.arrayContaining([
            expect.objectContaining({
              appointmentDate: { $lt: expect.any(Date) },
            }),
            expect.objectContaining({
              appointmentDate: {
                $gte: expect.any(Date),
                $lte: expect.any(Date),
              },
              appointmentTime: { $lte: expect.any(String) },
            }),
          ]),
        }),
        expect.objectContaining({
          $set: { status: AppointmentStatus.ONGOING },
        }),
      );
    });
  });
});
