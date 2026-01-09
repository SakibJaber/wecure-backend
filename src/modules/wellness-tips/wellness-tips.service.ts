import { Injectable } from '@nestjs/common';
import { CreateWellnessTipDto } from './dto/create-wellness-tip.dto';
import { UpdateWellnessTipDto } from './dto/update-wellness-tip.dto';

@Injectable()
export class WellnessTipsService {
  create(createWellnessTipDto: CreateWellnessTipDto) {
    return 'This action adds a new wellnessTip';
  }

  findAll() {
    return `This action returns all wellnessTips`;
  }

  findOne(id: number) {
    return `This action returns a #${id} wellnessTip`;
  }

  update(id: number, updateWellnessTipDto: UpdateWellnessTipDto) {
    return `This action updates a #${id} wellnessTip`;
  }

  remove(id: number) {
    return `This action removes a #${id} wellnessTip`;
  }
}
