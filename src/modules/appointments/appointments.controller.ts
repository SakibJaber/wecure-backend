import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Req,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AppointmentAccessGuard } from '../../common/guards/appointment-access.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { AddAppointmentAttachmentDto } from './dto/add-appointment-attachment.dto';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // Patient
  @Roles(Role.USER)
  @Post()
  create(@Req() req, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(req.user.userId, dto);
  }

  @Roles(Role.USER)
  @Get('me')
  getMine(@Req() req) {
    return this.appointmentsService.getForUser(req.user.userId);
  }

  @Roles(Role.USER)
  @Get('available-slots')
  getAvailableSlots(
    @Query('doctorId') doctorId: string,
    @Query('date') date: string,
  ) {
    return this.appointmentsService.getAvailableSlots(doctorId, new Date(date));
  }

  // Doctor
  @Roles(Role.DOCTOR)
  @Get('doctor')
  getDoctorAppointments(@Req() req) {
    return this.appointmentsService.getForDoctor(
      req.user.userId,
      req.user.doctorId,
    );
  }

  // Status update (doctor or patient)
  @Patch(':id/status')
  updateStatus(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    // For doctors, we use doctorId for permission check in service
    const requesterId =
      req.user.role === Role.DOCTOR ? req.user.userId : req.user.userId;

    return this.appointmentsService.updateStatus(
      id,
      requesterId,
      req.user.role,
      dto.status,
      req.user.doctorId,
    );
  }

  // Attachments
  @Post(':id/attachments')
  addAttachment(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: AddAppointmentAttachmentDto,
  ) {
    const requesterId =
      req.user.role === Role.DOCTOR ? req.user.userId : req.user.userId;

    return this.appointmentsService.addAttachment(
      id,
      requesterId,
      req.user.role,
      dto,
      req.user.doctorId,
    );
  }

  // Agora Video Token
  @UseGuards(AppointmentAccessGuard)
  @Post(':id/video/token')
  getVideoToken(@Req() req, @Param('id') id: string) {
    const user = req.user;
    // Use userId or doctorId as the UID for Agora
    // For simplicity and uniqueness, we can use the numeric timestamp of the ID creation or hash it
    // But Agora UID must be int (for buildTokenWithUid) or string (for buildTokenWithAccount)
    // We used buildTokenWithAccount in service if string is passed, so we can pass the string ID directly.
    // However, let's use the user's ID from the token.
    const uid = user.userId;
    const channelName = `appointment_${id}`;
    return this.appointmentsService.generateAgoraToken(channelName, uid);
  }

  // Agora Chat Token
  @UseGuards(AppointmentAccessGuard)
  @Post(':id/chat/token')
  getChatToken(@Req() req, @Param('id') id: string) {
    const user = req.user;
    const uid = user.userId;
    const channelName = `appointment_${id}`;
    return this.appointmentsService.generateAgoraToken(channelName, uid);
  }
}
