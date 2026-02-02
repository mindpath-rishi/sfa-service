import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  MEDIA_OWNER_TYPE,
  MEDIA_PURPOSE,
  MEDIA_TYPE,
} from 'src/shared/constants/media.constants';

export type MediaDocument = Media & Document;

/* ---------------- SUB-SCHEMAS ---------------- */

@Schema({ _id: false })
export class MediaUrls {
  @Prop({ type: String, default: undefined })
  small?: string;

  @Prop({ type: String, default: undefined })
  medium?: string;

  @Prop({ type: String, default: undefined })
  large?: string;

  @Prop({ type: String, default: undefined })
  original?: string;
}

export const MediaUrlsSchema = SchemaFactory.createForClass(MediaUrls);

@Schema({ _id: false })
export class MediaMeta {
  @Prop({ type: String, default: undefined })
  fileName?: string;

  @Prop({ type: String, default: undefined })
  mimeType?: string;

  @Prop({ type: Number, default: 0 })
  fileSize?: number;

  @Prop({ type: Number, default: 0 })
  width?: number;

  @Prop({ type: Number, default: 0 })
  height?: number;

  @Prop({ type: String, default: undefined })
  checksum?: string;
}

export const MediaMetaSchema = SchemaFactory.createForClass(MediaMeta);

/* ---------------- MAIN SCHEMA ---------------- */

@Schema({
  timestamps: false,
  versionKey: false,
})
export class Media {
  @Prop({ type: String, required: true, unique: true, trim: true })
  mediaId: string;

  /* ✅ Owner linkage */
  @Prop({
    type: String,
    required: true,
    enum: Object.values(MEDIA_OWNER_TYPE),
    index: true,
  })
  ownerType: string;

  @Prop({ type: String, required: true, index: true })
  ownerId: string;

  @Prop({ type: String, default: null, index: true })
  subOwnerId?: string | null;

  /* ✅ Media classification */
  @Prop({
    type: String,
    enum: Object.values(MEDIA_TYPE),
    default: MEDIA_TYPE.IMAGE,
    index: true,
  })
  mediaType: string;

  @Prop({
    type: String,
    enum: Object.values(MEDIA_PURPOSE),
    default: MEDIA_PURPOSE.OTHER,
    index: true,
  })
  purpose: string;

  /* ✅ Storage */
  @Prop({ type: String, required: true, index: true })
  storageKey: string;

  @Prop({ type: String, required: true })
  url: string;

  @Prop({ type: MediaUrlsSchema, default: undefined })
  urls?: MediaUrls;

  /* ✅ UI & SEO fields (for Product / Category banners etc.) */
  @Prop({ type: String, default: undefined, trim: true })
  title?: string;

  @Prop({ type: String, default: undefined, trim: true })
  description?: string;

  @Prop({ type: String, default: undefined, trim: true })
  altText?: string;

  /**
   * ✅ Where to navigate when user clicks the image/banner
   * Example:
   * - /products/P001
   * - /category/CAT001
   * - https://domain.com/offer
   */
  @Prop({ type: String, default: undefined, trim: true })
  navigationUrl?: string;

  @Prop({ type: [String], default: undefined, index: true })
  tags?: string[];

  /* ✅ Ordering */
  @Prop({ type: Number, default: 1, index: true })
  sortOrder: number;

  @Prop({ type: Boolean, default: false, index: true })
  isPrimary: boolean;

  /* ✅ Metadata */
  @Prop({ type: MediaMetaSchema, default: undefined })
  meta?: MediaMeta;

  /* ✅ Soft delete */
  @Prop({ type: Boolean, default: false, index: true })
  isDeleted: boolean;

  /* ✅ Audit */
  @Prop({ type: String, default: null })
  createdById?: string | null;

  @Prop({ type: String, default: null })
  updatedById?: string | null;
}

export const MediaSchema = SchemaFactory.createForClass(Media);

/* ---------------- INDEXES (SCALABLE) ---------------- */

// ✅ Fast fetch media by owner (gallery listing)
MediaSchema.index({ ownerType: 1, ownerId: 1, isDeleted: 1, sortOrder: 1 });

// ✅ Fast primary media lookup (main/profile/receipt etc.)
MediaSchema.index({
  ownerType: 1,
  ownerId: 1,
  purpose: 1,
  isPrimary: 1,
  isDeleted: 1,
});

// ✅ Fast sub-owner fetch (variant images / nested records)
MediaSchema.index({ ownerType: 1, ownerId: 1, subOwnerId: 1, isDeleted: 1 });

// ✅ Faster search by title/tags
MediaSchema.index({ ownerType: 1, ownerId: 1, title: 1, isDeleted: 1 });
MediaSchema.index({ tags: 1, isDeleted: 1 });
