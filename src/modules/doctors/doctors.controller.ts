import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Post()
  async create(@Body() createDoctorDto: CreateDoctorDto) {
    try {
      const result = await this.doctorsService.create(createDoctorDto);
      return {
        success: true,
        statusCode: 201,
        message: 'Doctor created successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to create doctor',
        data: null,
      };
    }
  }

  @Get()
  async findAll() {
    try {
      const result = await this.doctorsService.findAll();
      return {
        success: true,
        statusCode: 200,
        message: 'Doctors fetched successfully',
        data: result,
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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const result = await this.doctorsService.findOne(+id);
      return {
        success: true,
        statusCode: 200,
        message: 'Doctor fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch doctor',
        data: null,
      };
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDoctorDto: UpdateDoctorDto,
  ) {
    try {
      const result = await this.doctorsService.update(+id, updateDoctorDto);
      return {
        success: true,
        statusCode: 200,
        message: 'Doctor updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update doctor',
        data: null,
      };
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      const result = await this.doctorsService.remove(+id);
      return {
        success: true,
        statusCode: 200,
        message: 'Doctor deleted successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to delete doctor',
        data: null,
      };
    }
  }
}
