import { ConflictException } from '@nestjs/common';

import { LeaveService } from './leave.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { LEAVE } from './leave.constants';

describe('LeaveService', () => {
  let service: LeaveService;
  let activityModel: { findOne: jest.Mock };
  let workSessionModel: { findOne: jest.Mock };
  let mongo: { getModel: jest.Mock };

  beforeEach(() => {
    activityModel = {
      findOne: jest.fn().mockReturnValue({
        lean: () => ({
          exec: jest.fn().mockResolvedValue(null),
        }),
      }),
    };

    workSessionModel = {
      findOne: jest.fn().mockReturnValue({
        lean: () => ({
          exec: jest.fn().mockResolvedValue(null),
        }),
      }),
    };

    mongo = { getModel: jest.fn() };
    mongo.getModel.mockImplementation((name: string) => {
      if (name === 'Activity') return activityModel;
      if (name === 'WorkSession') return workSessionModel;

      return {
        findOne: jest.fn(),
        save: jest.fn(),
        updateById: jest.fn(),
        updateOne: jest.fn(),
      };
    });

    service = new LeaveService(mongo as any);

    jest.spyOn(service as any, 'withTransaction').mockImplementation(async (callback: any) => callback({}));
    jest.spyOn(service as any, 'findOne').mockResolvedValue(null);
  });

  it('blocks leave creation when retailing or offline work exists today', async () => {
    activityModel.findOne.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({ activityId: 'ACT-1' }),
      }),
    });

    const payload: CreateLeaveDto = {
      userId: 'user-1',
      type: 'HOLIDAY',
    };

    try {
      await service.create(payload);
      throw new Error('Expected leave creation to be blocked');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        message: LEAVE.TODAY_WORK_CONFLICT,
      });
    }
  });
});
