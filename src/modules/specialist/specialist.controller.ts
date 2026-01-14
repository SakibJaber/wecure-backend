import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { SpecialistService } from './specialist.service';
import { CreateSpecialistDto } from './dto/create-specialist.dto';
import { UpdateSpecialistDto } from './dto/update-specialist.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';

@Controller('specialist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpecialistController {
  constructor(private readonly specialistService: SpecialistService) {}

  @Roles(Role.ADMIN)
  @Post()
  async create(@Body() createSpecialistDto: CreateSpecialistDto) {
    try {
      const result = await this.specialistService.create(createSpecialistDto);
      return {
        success: true,
        statusCode: 201,
        message: 'Specialist created successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to create specialist',
        data: null,
      };
    }
  }

  @Get()
  async findAll() {
    try {
      const result = await this.specialistService.findAll();
      return {
        success: true,
        statusCode: 200,
        message: 'Specialists fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch specialists',
        data: null,
      };
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const result = await this.specialistService.findOne(+id);
      return {
        success: true,
        statusCode: 200,
        message: 'Specialist fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch specialist',
        data: null,
      };
    }
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateSpecialistDto: UpdateSpecialistDto,
  ) {
    try {
      const result = await this.specialistService.update(
        +id,
        updateSpecialistDto,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Specialist updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update specialist',
        data: null,
      };
    }
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      const result = await this.specialistService.remove(+id);
      return {
        success: true,
        statusCode: 200,
        message: 'Specialist deleted successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to delete specialist',
        data: null,
      };
    }
  }
}
