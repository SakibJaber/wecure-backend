import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { WellnessTipsService } from './wellness-tips.service';
import { CreateWellnessTipDto } from './dto/create-wellness-tip.dto';
import { UpdateWellnessTipDto } from './dto/update-wellness-tip.dto';

@Controller('wellness-tips')
export class WellnessTipsController {
  constructor(private readonly wellnessTipsService: WellnessTipsService) {}

  @Post()
  async create(@Body() createWellnessTipDto: CreateWellnessTipDto) {
    try {
      const result =
        await this.wellnessTipsService.create(createWellnessTipDto);
      return {
        success: true,
        statusCode: 201,
        message: 'Wellness tip created successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to create wellness tip',
        data: null,
      };
    }
  }

  @Get()
  async findAll() {
    try {
      const result = await this.wellnessTipsService.findAll();
      return {
        success: true,
        statusCode: 200,
        message: 'Wellness tips fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch wellness tips',
        data: null,
      };
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const result = await this.wellnessTipsService.findOne(+id);
      return {
        success: true,
        statusCode: 200,
        message: 'Wellness tip fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch wellness tip',
        data: null,
      };
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateWellnessTipDto: UpdateWellnessTipDto,
  ) {
    try {
      const result = await this.wellnessTipsService.update(
        +id,
        updateWellnessTipDto,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Wellness tip updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update wellness tip',
        data: null,
      };
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      const result = await this.wellnessTipsService.remove(+id);
      return {
        success: true,
        statusCode: 200,
        message: 'Wellness tip deleted successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to delete wellness tip',
        data: null,
      };
    }
  }
}
