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
  UseInterceptors,
  UploadedFile,
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
import { FileInterceptor } from '@nestjs/platform-express';
import { PrivateUploadService } from '../uploads/private-upload.service';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly privateUploadService: PrivateUploadService,
  ) {}

  // Patient
  @Roles(Role.USER)
  @Post()
  @UseInterceptors(FileInterceptor('attachment'))
  async create(
    @Req() req,
    @Body() dto: CreateAppointmentDto,
    @UploadedFile() attachment?: Express.Multer.File,
  ) {
    if (attachment) {
      const fileKey = await this.privateUploadService.handleUpload(
        attachment,
        'appointments',
        req.user.userId,
      );

      // Create attachment record
      const attachmentInfo =
        await this.appointmentsService.createAttachmentInfo(req.user.userId, {
          fileKey,
          fileType: attachment.mimetype,
        });

      // Add to dto
      if (!dto.attachmentIds) {
        dto.attachmentIds = [];
      }
      // Ensure attachmentIds is treated as an array even if single value sent by form-data
      if (typeof dto.attachmentIds === 'string') {
        dto.attachmentIds = [dto.attachmentIds];
      }
      dto.attachmentIds.push(attachmentInfo._id.toString());
    }

    return this.appointmentsService.create(req.user.userId, dto);
  }

  @Roles(Role.USER)
  @Get('me')
  getMine(@Req() req) {
    return this.appointmentsService.getForUser(req.user.userId);
  }

  @Roles(Role.USER)
  @Get('available-dates')
  getAvailableDates(
    @Query('doctorId') doctorId: string,
    @Query('days') days?: number,
  ) {
    return this.appointmentsService.getAvailableDates(doctorId, days);
  }

  @Roles(Role.USER)
  @Get('available-slots')
  getAvailableSlots(
    @Query('doctorId') doctorId: string,
    @Query('date') date: string,
  ) {
    return this.appointmentsService.getAvailableSlots(doctorId, new Date(date));
  }

  // Admin
  @Roles(Role.ADMIN)
  @Get('admin/doctor/:doctorId')
  async getDoctorAppointmentsForAdmin(
    @Req() req,
    @Param('doctorId') doctorId: string,
    @Query() query,
  ) {
    const { data, ...meta } = await this.appointmentsService.getForDoctor(
      req.user.userId,
      doctorId,
      query,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Doctor appointments fetched successfully',
      data,
      meta,
    };
  }

  // Doctor
  @Roles(Role.DOCTOR)
  @Get('doctor')
  async getDoctorAppointments(@Req() req, @Query() query) {
    const { data, ...meta } = await this.appointmentsService.getForDoctor(
      req.user.userId,
      req.user.doctorId,
      query,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Appointments fetched successfully',
      data,
      meta,
    };
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
  @Post('attachments')
  @Roles(Role.USER, Role.DOCTOR)
  @UseInterceptors(FileInterceptor('file'))
  async createAttachmentInfo(
    @Req() req,
    @Body() dto: AddAppointmentAttachmentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      const fileKey = await this.privateUploadService.handleUpload(
        file,
        'appointments',
      );
      dto.fileKey = fileKey;
      dto.fileType = file.mimetype;
    }
    return this.appointmentsService.createAttachmentInfo(req.user.userId, dto);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async addAttachment(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: AddAppointmentAttachmentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const requesterId =
      req.user.role === Role.DOCTOR ? req.user.userId : req.user.userId;

    if (file) {
      const fileKey = await this.privateUploadService.handleUpload(
        file,
        'appointments',
        req.user.userId,
      );
      dto.fileKey = fileKey;
      dto.fileType = file.mimetype;
    }

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
