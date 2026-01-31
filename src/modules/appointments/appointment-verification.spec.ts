import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentSchedulerService } from './appointment.scheduler';
import { AppointmentAccessGuard } from '../../common/guards/appointment-access.guard';
import { getModelToken } from '@nestjs/mongoose';
import { Appointment } from './schemas/appointment.schema';
import { AppointmentStatus } from '../../common/enum/appointment-status.enum';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('Appointment Verification', () => {
  let schedulerService: AppointmentSchedulerService;
  let guard: AppointmentAccessGuard;
  let appointmentModel: any;

  const mockAppointmentModel = {
    updateMany: jest.fn(),
    findById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentSchedulerService,
        AppointmentAccessGuard,
        {
          provide: getModelToken(Appointment.name),
          useValue: mockAppointmentModel,
        },
      ],
    }).compile();

    schedulerService = module.get<AppointmentSchedulerService>(
      AppointmentSchedulerService,
    );
    guard = module.get<AppointmentAccessGuard>(AppointmentAccessGuard);
  });

  describe('AppointmentSchedulerService', () => {
    it('should transition UPCOMING to ONGOING', async () => {
      mockAppointmentModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
      await schedulerService.handleAppointmentTransitions();

      expect(mockAppointmentModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AppointmentStatus.UPCOMING,
          $or: expect.arrayContaining([
            expect.objectContaining({ appointmentDate: expect.anything() }),
          ]),
        }),
        { $set: { status: AppointmentStatus.ONGOING } },
      );
    });

    it('should transition ONGOING to COMPLETED', async () => {
      mockAppointmentModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
      await schedulerService.handleAppointmentTransitions();

      expect(mockAppointmentModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AppointmentStatus.ONGOING,
          $or: expect.arrayContaining([
            expect.objectContaining({ appointmentDate: expect.anything() }),
          ]),
        }),
        { $set: { status: AppointmentStatus.COMPLETED } },
      );
    });
  });

  describe('AppointmentAccessGuard', () => {
    const createMockContext = (user: any, params: any) => {
      return {
        switchToHttp: () => ({
          getRequest: () => ({
            user,
            params,
          }),
        }),
      } as ExecutionContext;
    };

    const userId = new Types.ObjectId();
    const doctorId = new Types.ObjectId();

    it('should allow access within grace period (5 mins before)', async () => {
      const now = new Date();
      const start = new Date(now.getTime() + 4 * 60 * 1000); // Starts in 4 mins

      const appointment = {
        userId,
        doctorId,
        appointmentDate: start,
        appointmentTime: `${start.getHours()}:${start.getMinutes()}`,
        appointmentEndTime: '23:59',
        status: AppointmentStatus.UPCOMING,
      };

      mockAppointmentModel.findById.mockResolvedValue(appointment);

      const context = createMockContext(
        { userId: userId.toString(), role: 'USER' },
        { id: 'apptId' },
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should deny access outside grace period (6 mins before)', async () => {
      const now = new Date();
      const start = new Date(now.getTime() + 6 * 60 * 1000); // Starts in 6 mins

      const appointment = {
        userId,
        doctorId,
        appointmentDate: start,
        appointmentTime: `${start.getHours()}:${start.getMinutes()}`,
        appointmentEndTime: '23:59',
        status: AppointmentStatus.UPCOMING,
      };

      mockAppointmentModel.findById.mockResolvedValue(appointment);

      const context = createMockContext(
        { userId: userId.toString(), role: 'USER' },
        { id: 'apptId' },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow access within grace period (5 mins after end)', async () => {
      const now = new Date();
      const end = new Date(now.getTime() - 4 * 60 * 1000); // Ended 4 mins ago

      const appointment = {
        userId,
        doctorId,
        appointmentDate: end, // Date is same day
        appointmentTime: '00:00',
        appointmentEndTime: `${end.getHours()}:${end.getMinutes()}`,
        status: AppointmentStatus.COMPLETED,
      };

      mockAppointmentModel.findById.mockResolvedValue(appointment);

      const context = createMockContext(
        { userId: userId.toString(), role: 'USER' },
        { id: 'apptId' },
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should deny access outside grace period (6 mins after end)', async () => {
      const now = new Date();
      const end = new Date(now.getTime() - 6 * 60 * 1000); // Ended 6 mins ago

      const appointment = {
        userId,
        doctorId,
        appointmentDate: end,
        appointmentTime: '00:00',
        appointmentEndTime: `${end.getHours()}:${end.getMinutes()}`,
        status: AppointmentStatus.COMPLETED,
      };

      mockAppointmentModel.findById.mockResolvedValue(appointment);

      const context = createMockContext(
        { userId: userId.toString(), role: 'USER' },
        { id: 'apptId' },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
