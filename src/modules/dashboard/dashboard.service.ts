import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../appointments/schemas/appointment.schema';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';
import { Role } from 'src/common/enum/role.enum';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
  ) {}

  async getAdminDashboardStats(): Promise<any> {
    const currentYear = new Date().getFullYear();

    // 1. Total Patients & Doctors
    const [totalPatients, totalDoctors] = await Promise.all([
      this.userModel.countDocuments({ role: Role.USER }),
      this.doctorModel.countDocuments(),
    ]);

    // 2. Appointment Stats
    // Status can be: PENDING, CONFIRMED, CANCELLED, COMPLETED, RESCHEDULED, IN_PROGRESS, REJECTED
    // Let's map "Total Request" to PENDING, "Complete" to COMPLETED, "Canceled" to CANCELLED.
    const appointmentStats = await this.appointmentModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    let totalRequests = 0;
    let completeConsultations = 0;
    let canceledAppointments = 0;

    appointmentStats.forEach((stat) => {
      if (stat._id === AppointmentStatus.PENDING) totalRequests += stat.count;
      else if (stat._id === AppointmentStatus.COMPLETED)
        completeConsultations += stat.count;
      else if (stat._id === AppointmentStatus.CANCELLED)
        canceledAppointments += stat.count;
    });

    const totalAppointments = await this.appointmentModel.countDocuments();

    // 3. Revenue
    // Revenue Activity for the current year, grouped by month
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear + 1, 0, 1);

    const revenuePipeline = await this.paymentModel.aggregate([
      {
        $match: {
          status: 'PAID',
          createdAt: {
            $gte: startOfYear,
            $lt: endOfYear,
          },
        },
      },
      {
        $group: {
          _id: { $month: '$createdAt' }, // 1 to 12
          totalAmount: { $sum: '$amount' },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    let totalRevenue = 0;
    const monthlyRevenueRaw = new Array(12).fill(0);

    revenuePipeline.forEach((item) => {
      const monthIndex = item._id - 1; // 0 for Jan, 11 for Dec
      monthlyRevenueRaw[monthIndex] = item.totalAmount;
      totalRevenue += item.totalAmount;
    });

    // Format for easy UI rendering
    return {
      overview: {
        totalPatients,
        totalDoctors,
        totalAppointments,
        completeConsultations,
      },
      revenueActivity: {
        year: currentYear,
        monthly: monthlyRevenueRaw,
      },
      revenue: totalRevenue,
      status: {
        totalRequests, // e.g., PENDING
        completed: completeConsultations,
        canceled: canceledAppointments,
        // We can add "other" for confirmed, etc if necessary, but UI just shows Request, Complete, Canceled
      },
    };
  }
}
