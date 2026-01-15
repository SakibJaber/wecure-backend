import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';

@Controller('doctors/me/availability')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DOCTOR)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateAvailabilityDto) {
    return this.availabilityService.create(req.user.userId, dto);
  }

  @Get()
  getMine(@Req() req) {
    return this.availabilityService.getByDoctor(req.user.userId);
  }

  @Patch(':id')
  toggle(
    @Req() req,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.availabilityService.toggleAvailability(
      req.user.userId,
      id,
      body.isActive,
    );
  }

  @Delete(':id')
  remove(@Req() req, @Param('id') id: string) {
    return this.availabilityService.remove(req.user.userId, id);
  }
}
