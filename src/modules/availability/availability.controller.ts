import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post()
  async create(@Body() createAvailabilityDto: CreateAvailabilityDto) {
    try {
      const result = await this.availabilityService.create(
        createAvailabilityDto,
      );
      return {
        success: true,
        statusCode: 201,
        message: 'Availability created successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to create availability',
        data: null,
      };
    }
  }

  @Get()
  async findAll() {
    try {
      const result = await this.availabilityService.findAll();
      return {
        success: true,
        statusCode: 200,
        message: 'Availabilities fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch availabilities',
        data: null,
      };
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const result = await this.availabilityService.findOne(+id);
      return {
        success: true,
        statusCode: 200,
        message: 'Availability fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch availability',
        data: null,
      };
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateAvailabilityDto: UpdateAvailabilityDto,
  ) {
    try {
      const result = await this.availabilityService.update(
        +id,
        updateAvailabilityDto,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Availability updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update availability',
        data: null,
      };
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      const result = await this.availabilityService.remove(+id);
      return {
        success: true,
        statusCode: 200,
        message: 'Availability deleted successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to delete availability',
        data: null,
      };
    }
  }
}
