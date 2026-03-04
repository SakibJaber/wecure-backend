import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getModelToken } from '@nestjs/mongoose';
import { User } from './schemas/user.schema';
import { EncryptionService } from 'src/common/services/encryption.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('UsersService', () => {
  let service: UsersService;
  let model: any;
  let encryptionService: EncryptionService;

  const mockUser = {
    _id: 'user123',
    bankName: '32hexcharsiv:encryptedbank',
    accountName: '32hexcharsiv:encryptedname',
    accountNumber: '32hexcharsiv:encryptednumber',
  };

  const mockUserModel = {
    findById: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn((text) => `32hexcharsiv:encrypted${text}`),
    decrypt: jest.fn((text) => text.replace('32hexcharsiv:encrypted', '')),
    isEncrypted: jest.fn((text) => text.startsWith('32hexcharsiv:')),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    model = module.get(getModelToken(User.name));
    encryptionService = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBankDetails', () => {
    it('should return decrypted bank details', async () => {
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      const result = await service.getBankDetails('user123');

      expect(result).toEqual({
        bankName: 'bank',
        accountName: 'name',
        accountNumber: 'number',
      });
      expect(mockUserModel.findById).toHaveBeenCalledWith('user123');
      expect(mockEncryptionService.decrypt).toHaveBeenCalledTimes(3);
    });

    it('should throw BadRequestException if user not found', async () => {
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getBankDetails('user123')).rejects.toThrow(
        'User not found',
      );
    });
  });
});
