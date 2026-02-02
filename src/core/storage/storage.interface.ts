export type UploadResult = {
  storageKey: string;
  url: string;

  // ✅ optional (only for IMAGE multi-size use case)
  urls?: {
    original?: string;
    large?: string;
    medium?: string;
    small?: string;
  };

  meta?: {
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    width?: number;
    height?: number;
  };
};

export interface StorageProvider {
  upload(params: {
    file: Express.Multer.File;
    folder?: string;

    // ✅ if true, provider should generate small/medium/large/original
    generateVariants?: boolean;
    mediaType: string;
  }): Promise<UploadResult>;

  delete(params: { storageKey: string }): Promise<void>;
}
