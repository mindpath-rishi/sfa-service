import { ExpenseController } from './expense.controller';
import { ExpenseService } from './expense.service';

describe('ExpenseController', () => {
  const preview = jest.fn().mockResolvedValue({});
  const controller = new ExpenseController({
    preview,
  } as unknown as ExpenseService);

  beforeEach(() => preview.mockClear());

  it.each([
    [undefined, []],
    ['', []],
    ['B1', ['B1']],
    ['B1,B2,,B3', ['B1', 'B2', 'B3']],
    [
      ['B1', 'B2'],
      ['B1', 'B2'],
    ],
  ])('preview parses beatIds %p', async (input, expected) => {
    await controller.preview(input);
    expect(preview).toHaveBeenCalledWith(expected);
  });
});
