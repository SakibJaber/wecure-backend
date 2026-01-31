import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { UpdateVerificationStatusDto } from './dto/update-verification-status.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { Role } from 'src/common/enum/role.enum';
import { GlobalPublicUploadInterceptor } from '../public-upload/public-upload.interceptor';

@Controller('doctors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Roles(Role.DOCTOR)
  @Post('me/profile')
  createProfile(@Req() req, @Body() dto: CreateDoctorDto) {
    return this.doctorsService.createProfile(req.user.userId, dto);
  }

  @Roles(Role.DOCTOR)
  @Patch('me/profile')
  @UseInterceptors(
    GlobalPublicUploadInterceptor({
      fieldName: 'image',
      maxCount: 1,
      allowedMimes: /\/(jpg|jpeg|png|webp)$/i,
      maxFileSizeBytes: 5 * 1024 * 1024, // 5MB
    }),
  )
  updateProfile(
    @Req() req,
    @Body() dto: UpdateDoctorDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.doctorsService.updateProfile(req.user.userId, dto, file);
  }

  @Get('me/profile')
  getMyProfile(@Req() req) {
    return this.doctorsService.getMyProfile(req.user.userId);
  }

  // Services
  @Post('me/services')
  addService(@Req() req, @Body() dto) {
    return this.doctorsService.addService(req.user.userId, dto.name);
  }

  @Delete('me/services/:id')
  removeService(@Req() req, @Param('id') id: string) {
    return this.doctorsService.deleteService(req.user.userId, id);
  }

  // Documents
  @Roles(Role.DOCTOR)
  @Post('me/documents')
  @UseInterceptors(
    GlobalPublicUploadInterceptor({
      fieldName: 'document',
      maxCount: 1,
      allowedMimes: /\/(pdf|jpg|jpeg|png)$/i,
      maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
    }),
  )
  async uploadDocument(@Req() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error('No file uploaded');
    }
    return this.doctorsService.uploadVerificationDocument(
      req.user.userId,
      file,
    );
  }

  // Experience
  @Post('me/experiences')
  addExperience(@Req() req, @Body() dto) {
    return this.doctorsService.addExperience(req.user.userId, dto);
  }

  // Admin endpoints
  @Roles(Role.ADMIN)
  @Get('admin/all')
  async getAllDoctors(@Query() query) {
    try {
      const { data, ...meta } =
        await this.doctorsService.getAllDoctorsForAdmin(query);
      return {
        success: true,
        statusCode: 200,
        message: 'Doctors fetched successfully',
        data,
        meta,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch doctors',
        data: null,
      };
    }
  }

  @Roles(Role.ADMIN)
  @Patch(':id/status')
  updateVerificationStatus(
    @Param('id') id: string,
    @Body() dto: UpdateVerificationStatusDto,
  ) {
    return this.doctorsService.updateVerificationStatus(
      id,
      dto.status,
      dto.note,
    );
  }

  @Public()
  @Get('popular')
  async getPopularDoctors() {
    try {
      const doctors = await this.doctorsService.getPopularDoctors();
      return {
        success: true,
        statusCode: 200,
        message: 'Popular doctors fetched successfully',
        data: doctors,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch popular doctors',
        data: null,
      };
    }
  }

  @Public()
  @Get('specialty/:specialtyId')
  async getDoctorsBySpecialty(@Param('specialtyId') specialtyId: string) {
    try {
      const doctors =
        await this.doctorsService.getDoctorsBySpecialty(specialtyId);
      return {
        success: true,
        statusCode: 200,
        message: 'Doctors fetched successfully',
        data: doctors,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch doctors',
        data: null,
      };
    }
  }

  @Public()
  @Get(':id/public')
  getPublicDoctorProfile(@Param('id') id: string) {
    return this.doctorsService.getPublicProfile(id);
  }
}
