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
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  async create(@Body() createAppointmentDto: CreateAppointmentDto) {
    try {
      const result =
        await this.appointmentsService.create(createAppointmentDto);
      return {
        success: true,
        statusCode: 201,
        message: 'Appointment created successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to create appointment',
        data: null,
      };
    }
  }

  @Get()
  async findAll(@Req() req) {
    try {
      const result = await this.appointmentsService.findAll(
        req.user.userId,
        req.user.role,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Appointments fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch appointments',
        data: null,
      };
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req) {
    try {
      const result = await this.appointmentsService.findOne(
        id,
        req.user.userId,
        req.user.role,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Appointment fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch appointment',
        data: null,
      };
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateAppointmentDto: UpdateAppointmentDto,
    @Req() req,
  ) {
    try {
      const result = await this.appointmentsService.update(
        id,
        updateAppointmentDto,
        req.user.userId,
        req.user.role,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Appointment updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update appointment',
        data: null,
      };
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req) {
    try {
      const result = await this.appointmentsService.remove(
        id,
        req.user.userId,
        req.user.role,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Appointment deleted successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to delete appointment',
        data: null,
      };
    }
  }
}
