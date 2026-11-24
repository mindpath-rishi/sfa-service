// Stub the sale service's collaborators: these tests inject plain mocks, and the
// real modules load Mongoose schemas whose decorators ts-jest can't evaluate.
jest.mock('../product/product.service', () => ({ ProductService: class {} }));
jest.mock('../sale-item/sale-item.service', () => ({ SaleItemService: class {} }));
jest.mock('../payment/payment.service', () => ({ PaymentService: class {} }));
jest.mock('../van-inventory/van-inventory.service', () => ({ VanInventoryService: class {} }));
jest.mock('../inventory-transaction/inventory-transaction.service', () => ({
  InventoryTransactionService: class {},
}));
jest.mock('../customer/customer.service', () => ({ CustomerService: class {} }));
jest.mock('../van-daily-stock/van-daily-stock.service', () => ({ VanDailyStockService: class {} }));
jest.mock('../shop-visit/shop-visit.service', () => ({ ShopVisitService: class {} }));

import { SaleService } from './sale.service';
import { ShopVisitStatus } from 'src/shared/enums/shop-visit.enums';

describe('SaleService.completeVisitWithSale', () => {
  let service: SaleService;
  let shopVisitService: { findOne: jest.Mock; update: jest.Mock };
  const session = { id: 'session-1' } as any;
  const location = { latitude: -15.4, longitude: 28.3, accuracy: 12 };

  const complete = (visitId: string, checkOutLocation?: any) =>
    (service as any).completeVisitWithSale(visitId, checkOutLocation, session);

  beforeEach(() => {
    shopVisitService = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ statusCode: 200 }),
    };
    const mongo = { getModel: jest.fn().mockReturnValue({}) };

    service = new SaleService(
      mongo as any,
      {} as any, // productService
      {} as any, // saleItemService
      {} as any, // paymentService
      {} as any, // inventoryService
      {} as any, // inventoryTxnService
      {} as any, // customerService
      {} as any, // vanDailyStockService
      {} as any, // oracleRepository
      shopVisitService as any,
    );
  });

  it('closes an active visit in the sale transaction with the check-out location', async () => {
    shopVisitService.findOne.mockResolvedValue({ visitId: 'V1', status: ShopVisitStatus.ACTIVE });

    await expect(complete('V1', location)).resolves.toBe(true);

    expect(shopVisitService.findOne).toHaveBeenCalledWith({ visitId: 'V1' }, { session });
    expect(shopVisitService.update).toHaveBeenCalledWith(
      'V1',
      expect.objectContaining({
        status: ShopVisitStatus.COMPLETED,
        checkOutLocation: location,
        checkOutTime: expect.any(Date),
      }),
      session,
    );
  });

  it('closes the visit without a location when none was captured', async () => {
    shopVisitService.findOne.mockResolvedValue({ visitId: 'V1', status: ShopVisitStatus.ACTIVE });

    await complete('V1', undefined);

    const dto = shopVisitService.update.mock.calls[0][1];
    expect(dto.status).toBe(ShopVisitStatus.COMPLETED);
    expect(dto).not.toHaveProperty('checkOutLocation');
  });

  it('skips a visit that is already completed (never fails the sale)', async () => {
    shopVisitService.findOne.mockResolvedValue({ visitId: 'V1', status: ShopVisitStatus.COMPLETED });

    await expect(complete('V1', location)).resolves.toBe(false);
    expect(shopVisitService.update).not.toHaveBeenCalled();
  });

  it('skips a missing visit (never fails the sale)', async () => {
    shopVisitService.findOne.mockResolvedValue(null);

    await expect(complete('MISSING', location)).resolves.toBe(false);
    expect(shopVisitService.update).not.toHaveBeenCalled();
  });
});
