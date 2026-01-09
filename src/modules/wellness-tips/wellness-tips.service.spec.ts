import { Test, TestingModule } from '@nestjs/testing';
import { WellnessTipsService } from './wellness-tips.service';

describe('WellnessTipsService', () => {
  let service: WellnessTipsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WellnessTipsService],
    }).compile();

    service = module.get<WellnessTipsService>(WellnessTipsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
