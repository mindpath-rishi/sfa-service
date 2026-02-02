import { randomUUID } from 'crypto';

export class IdGenerator {
  /**
   * Generate prefixed unique ID
   * Example: CID-1A2B3C4D
   */
  static generate(
    prefix: string,
    length: number = 8,
  ): string {
    return `${prefix}-${randomUUID()
      .replace(/-/g, '')
      .slice(0, length)
      .toUpperCase()}`;
  }

  /* ================= CONVENIENCE METHODS ================= */

  static customerId(): string {
    return this.generate('CID');
  }

  static employeeId(): string {
    return this.generate('EID');
  }

  static roleId(): string {
    return this.generate('RID');
  }

  static orderId(): string {
    return this.generate('OID');
  }
}
