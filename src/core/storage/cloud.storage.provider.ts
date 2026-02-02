import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { StorageProvider, UploadResult } from './storage.interface';


@Injectable()
export class CloudStorageProvider implements StorageProvider {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUD_STORAGE_NAME,
      api_key: process.env.CLOUD_STORAGE_KEY,
      api_secret: process.env.CLOUD_STORAGE_SECRET,
    });
  }

  async upload(params: {
    file: Express.Multer.File;
    folder?: string;
    generateVariants?: boolean;
  }): Promise<UploadResult> {
    const { file, folder = 'media', generateVariants = false } = params;

    const base64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

    const result = await cloudinary.uploader.upload(base64, {
      folder,
      resource_type: 'auto',
    });

    const uploaded: UploadResult = {
      storageKey: result.public_id, // ✅ stable ID for cloud
      url: result.secure_url,
      meta: {
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        width: result.width,
        height: result.height,
      },
    };

    // ✅ Only generate variants if IMAGE
    if (generateVariants && file.mimetype.startsWith('image/')) {
      uploaded.urls = {
        original: result.secure_url,

        // ✅ transformation urls (no extra file upload needed)
        large: cloudinary.url(result.public_id, {
          secure: true,
          width: 1200,
          crop: 'limit',
          fetch_format: 'auto',
          quality: 'auto',
        }),

        medium: cloudinary.url(result.public_id, {
          secure: true,
          width: 600,
          crop: 'limit',
          fetch_format: 'auto',
          quality: 'auto',
        }),

        small: cloudinary.url(result.public_id, {
          secure: true,
          width: 200,
          crop: 'limit',
          fetch_format: 'auto',
          quality: 'auto',
        }),
      };
    }

    return uploaded;
  }

  async delete(params: { storageKey: string }): Promise<void> {
    await cloudinary.uploader.destroy(params.storageKey, { resource_type: 'image' });
  }
}
