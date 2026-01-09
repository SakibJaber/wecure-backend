import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { WellnessTipsService } from './wellness-tips.service';
import { CreateWellnessTipDto } from './dto/create-wellness-tip.dto';
import { UpdateWellnessTipDto } from './dto/update-wellness-tip.dto';

@Controller('wellness-tips')
export class WellnessTipsController {
  constructor(private readonly wellnessTipsService: WellnessTipsService) {}

  @Post()
  create(@Body() createWellnessTipDto: CreateWellnessTipDto) {
    return this.wellnessTipsService.create(createWellnessTipDto);
  }

  @Get()
  findAll() {
    return this.wellnessTipsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.wellnessTipsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateWellnessTipDto: UpdateWellnessTipDto) {
    return this.wellnessTipsService.update(+id, updateWellnessTipDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.wellnessTipsService.remove(+id);
  }
}
