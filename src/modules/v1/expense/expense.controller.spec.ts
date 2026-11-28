import { ExpenseController } from './expense.controller';
import { ExpenseService } from './expense.service';

describe('ExpenseController', () => {
  const preview = jest.fn().mockResolvedValue({});
  const create = jest.fn().mockResolvedValue({});
  const controller = new ExpenseController({
    preview,
    create,
  } as unknown as ExpenseService);

  it('preview takes no input', async () => {
    await controller.preview();
    expect(preview).toHaveBeenCalledWith();
  });

  it('create takes no body', async () => {
    await controller.create();
    expect(create).toHaveBeenCalledWith();
  });
});
