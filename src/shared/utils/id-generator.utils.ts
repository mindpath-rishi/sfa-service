export class IdGenerator {
  /**
   * Generate an ID using the first letter of the schema name.
   * Example: Sale -> SID12345678
   */
  static generate(schemaName: string, length: number = 8): string {
    const schemaInitial = schemaName.trim().charAt(0).toUpperCase();

    return `${schemaInitial}ID${this.generateRandomNumber(length)}`;
  }

  static generateRandomNumber(length: number = 8): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;

    return Math.floor(min + Math.random() * (max - min + 1)).toString();
  }

  /* ================= CONVENIENCE METHODS ================= */

  static customerId(): string {
    return this.generateRandomNumber(12);
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
