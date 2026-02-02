import { createHash } from 'crypto';

export type ChecksumAlgorithm = 'sha256' | 'md5';

export class ChecksumUtil {
  /**
   * ✅ Generate checksum for any Buffer
   * Default: sha256 (recommended)
   */
  static generate(buffer: Buffer, algorithm: ChecksumAlgorithm = 'sha256'): string {
    return createHash(algorithm).update(buffer).digest('hex');
  }

  /**
   * ✅ Generate checksum for uploaded file (multer)
   * Works with Express.Multer.File
   */
  static fromFile(
    file: { buffer: Buffer },
    algorithm: ChecksumAlgorithm = 'sha256',
  ): string {
    return this.generate(file.buffer, algorithm);
  }
}
