// import { Injectable } from '@nestjs/common';
// import * as fs from 'fs';
// import * as path from 'path';
// import { randomUUID } from 'crypto';
// import sharp from 'sharp';

// import type { StorageProvider, UploadResult } from './storage.interface';

// @Injectable()
// export class LocalStorageProvider implements StorageProvider {
//   private readonly baseDir = path.join(process.cwd(), 'uploads');

//   constructor() {
//     if (!fs.existsSync(this.baseDir)) {
//       fs.mkdirSync(this.baseDir, { recursive: true });
//     }
//   }

//   async upload(params: {
//     file: Express.Multer.File;
//     folder?: string;
//     generateVariants?: boolean;
//   }): Promise<UploadResult> {
//     const { file, folder = 'media', generateVariants = false } = params;

//     const fileId = randomUUID().replaceAll('-', '');
//     const uploadDir = path.join(this.baseDir, folder);

//     if (!fs.existsSync(uploadDir)) {
//       fs.mkdirSync(uploadDir, { recursive: true });
//     }

//     const isImage = file.mimetype?.startsWith('image/');

//     // ✅ For non-image (PDF/DOC/VIDEO): save as original
//     if (!isImage) {
//       const ext = path.extname(file.originalname || '').toLowerCase() || '';
//       const safeExt = ext.length <= 10 ? ext : ''; // ✅ safety

//       const fileName = `${fileId}${safeExt}`;
//       const fullPath = path.join(uploadDir, fileName);

//       await fs.promises.writeFile(fullPath, file.buffer);

//       const storageKey = `${folder}/${fileName}`.replaceAll('\\', '/');
//       const url = `/uploads/${storageKey}`.replaceAll('\\', '/');

//       return {
//         storageKey,
//         url,
//         meta: {
//           fileName: file.originalname,
//           mimeType: file.mimetype,
//           fileSize: file.size,
//         },
//       };
//     }

//     // ✅ For image: store original + variants (webp)
//     const originalName = `${fileId}-original.webp`;
//     const originalPath = path.join(uploadDir, originalName);

//     await sharp(file.buffer).webp({ quality: 90 }).toFile(originalPath);

//     const storageKey = `${folder}/${originalName}`.replaceAll('\\', '/');
//     const originalUrl = `/uploads/${storageKey}`.replaceAll('\\', '/');

//     const uploaded: UploadResult = {
//       storageKey,
//       url: originalUrl,
//       urls: {
//         original: originalUrl,
//       },
//       meta: {
//         fileName: file.originalname,
//         mimeType: file.mimetype,
//         fileSize: file.size,
//       },
//     };

//     // ✅ generate variants only if requested
//     if (generateVariants) {
//       const variants = [
//         { key: 'large', width: 1200 },
//         { key: 'medium', width: 600 },
//         { key: 'small', width: 200 },
//       ] as const;

//       for (const v of variants) {
//         const variantName = `${fileId}-${v.key}.webp`;
//         const variantPath = path.join(uploadDir, variantName);

//         await sharp(file.buffer)
//           .resize({ width: v.width, withoutEnlargement: true })
//           .webp({ quality: 85 })
//           .toFile(variantPath);

//         const variantKey = `${folder}/${variantName}`.replaceAll('\\', '/');
//         const variantUrl = `/uploads/${variantKey}`.replaceAll('\\', '/');

//         uploaded.urls ||= {};
//         uploaded.urls[v.key] = variantUrl;
//       }
//     }

//     return uploaded;
//   }

//   async delete(params: { storageKey: string }): Promise<void> {
//     let key = params.storageKey;

//     // ✅ If frontend sends URL instead of key
//     if (key.startsWith('/uploads/')) {
//       key = key.replace('/uploads/', '');
//     }

//     // ✅ remove starting slash if exists
//     key = key.replace(/^\/+/, '');

//     const fullPath = path.join(this.baseDir, key);

//     if (fs.existsSync(fullPath)) {
//       await fs.promises.unlink(fullPath);
//     }
//   }
// }


import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

import type { StorageProvider, UploadResult } from './storage.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir = path.join(process.cwd(), 'uploads');

  constructor() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private isFileTypeMatchingMediaType(mediaType: string | undefined, mime: string) {
    if (!mediaType) return true; // ✅ if not provided, allow

    const mt = String(mediaType).toLowerCase();

    // ✅ image types
    if (mt === 'image') return mime.startsWith('image/');

    // ✅ pdf types
    if (mt === 'pdf') return mime === 'application/pdf';

    // ✅ video types
    if (mt === 'video') return mime.startsWith('video/');

    // ✅ audio types
    if (mt === 'audio') return mime.startsWith('audio/');

    // ✅ if unknown mediaType, allow (or you can block)
    return true;
  }

  async upload(params: {
    file: Express.Multer.File;
    folder?: string;
    generateVariants?: boolean;
    mediaType?: string; // ✅ new
  }): Promise<UploadResult> {
    const { file, folder = 'media', generateVariants = false, mediaType } = params;

    // ✅ Validate file type matches mediaType
    const mime = file?.mimetype || '';
    const isValid = this.isFileTypeMatchingMediaType(mediaType, mime);

    if (!isValid) {
      throw new BadRequestException(
        `File type (${mime}) does not match mediaType (${mediaType}).`,
      );
    }

    const fileId = randomUUID().replaceAll('-', '');
    const uploadDir = path.join(this.baseDir, folder);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const isImage = mime.startsWith('image/');

    // ✅ For non-image (PDF/DOC/VIDEO): save as original
    if (!isImage) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '';
      const safeExt = ext.length <= 10 ? ext : '';

      const fileName = `${fileId}${safeExt}`;
      const fullPath = path.join(uploadDir, fileName);

      await fs.promises.writeFile(fullPath, file.buffer);

      const storageKey = `${folder}/${fileName}`.replaceAll('\\', '/');
      const url = `/uploads/${storageKey}`.replaceAll('\\', '/');

      return {
        storageKey,
        url,
        meta: {
          fileName: file.originalname,
          mimeType: mime,
          fileSize: file.size,
        },
      };
    }

    // ✅ For image: store original + variants (webp)
    const originalName = `${fileId}-original.webp`;
    const originalPath = path.join(uploadDir, originalName);

    await sharp(file.buffer).webp({ quality: 90 }).toFile(originalPath);

    const storageKey = `${folder}/${originalName}`.replaceAll('\\', '/');
    const originalUrl = `/uploads/${storageKey}`.replaceAll('\\', '/');

    const uploaded: UploadResult = {
      storageKey,
      url: originalUrl,
      urls: {
        original: originalUrl,
      },
      meta: {
        fileName: file.originalname,
        mimeType: mime,
        fileSize: file.size,
        // mediaType: mediaType,
      },
    };

    // ✅ generate variants only if requested
    if (generateVariants) {
      const variants = [
        { key: 'large', width: 1200 },
        { key: 'medium', width: 600 },
        { key: 'small', width: 200 },
      ] as const;

      for (const v of variants) {
        const variantName = `${fileId}-${v.key}.webp`;
        const variantPath = path.join(uploadDir, variantName);

        await sharp(file.buffer)
          .resize({ width: v.width, withoutEnlargement: true })
          .webp({ quality: 85 })
          .toFile(variantPath);

        const variantKey = `${folder}/${variantName}`.replaceAll('\\', '/');
        const variantUrl = `/uploads/${variantKey}`.replaceAll('\\', '/');

        uploaded.urls ||= {};
        uploaded.urls[v.key] = variantUrl;
      }
    }

    return uploaded;
  }

  async delete(params: { storageKey: string }): Promise<void> {
    let key = params.storageKey;

    if (key.startsWith('/uploads/')) {
      key = key.replace('/uploads/', '');
    }

    key = key.replace(/^\/+/, '');

    const fullPath = path.join(this.baseDir, key);

    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  }
}
