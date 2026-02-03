/**
 * Media Collection
 * ----------------
 * Purpose : Centralized storage for all media assets
 * Used by : PRODUCT / CATEGORY / USER / CMS / BANNERS
 *
 * Contains:
 * - Media ownership and classification
 * - Storage and access URLs
 * - UI/SEO related metadata
 * - Ordering and primary media flags
 *
 * Notes:
 * - Supports multiple resolutions per media
 * - Soft delete is used instead of hard delete
 * - One owner can have multiple media records
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  MEDIA_OWNER_TYPE,
  MEDIA_PURPOSE,
  MEDIA_TYPE,
} from 'src/shared/constants/media.constants';

export type MediaDocument = Media & Document;

/* ======================================================
 * SUB-SCHEMAS
 * ====================================================== */

/**
 * Holds multiple image resolutions for responsive usage.
 */
@Schema({ _id: false, timestamps: false })
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

/**
 * Stores technical metadata of the uploaded file.
 */
@Schema({ _id: false, timestamps: false })
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

/* ======================================================
 * MAIN SCHEMA
 * ====================================================== */

@Schema({
  versionKey: false,
})
export class Media {
  /* ======================================================
   * IDENTITY
   * ====================================================== */

  @Prop({ type: String, required: true, unique: true, trim: true })
  mediaId: string;

  /* ======================================================
   * OWNER LINKAGE
   * ====================================================== */

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

  /* ======================================================
   * MEDIA CLASSIFICATION
   * ====================================================== */

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

  /* ======================================================
   * STORAGE
   * ====================================================== */

  @Prop({ type: String, required: true, index: true })
  storageKey: string;

  @Prop({ type: String, required: true })
  url: string;

  @Prop({ type: MediaUrlsSchema, default: undefined })
  urls?: MediaUrls;

  /* ======================================================
   * UI & SEO
   * ====================================================== */

  @Prop({ type: String, default: undefined, trim: true })
  title?: string;

  @Prop({ type: String, default: undefined, trim: true })
  description?: string;

  @Prop({ type: String, default: undefined, trim: true })
  altText?: string;

  @Prop({ type: String, default: undefined, trim: true })
  navigationUrl?: string;

  @Prop({ type: [String], default: undefined, index: true })
  tags?: string[];

  /* ======================================================
   * ORDERING
   * ====================================================== */

  @Prop({ type: Number, default: 1, index: true })
  sortOrder: number;

  @Prop({ type: Boolean, default: false, index: true })
  isPrimary: boolean;

  /* ======================================================
   * METADATA
   * ====================================================== */

  @Prop({ type: MediaMetaSchema, default: undefined })
  meta?: MediaMeta;

  /* ======================================================
   * SOFT DELETE
   * ====================================================== */

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted: boolean;
}

export const MediaSchema = SchemaFactory.createForClass(Media);

/* ======================================================
 * INDEXES (SCALABLE)
 * ====================================================== */

// Fast gallery listing per owner
MediaSchema.index({ ownerType: 1, ownerId: 1, isDeleted: 1, sortOrder: 1 });

// Fast primary media lookup
MediaSchema.index({
  ownerType: 1,
  ownerId: 1,
  purpose: 1,
  isPrimary: 1,
  isDeleted: 1,
});

// Sub-owner media fetch (variants, nested entities)
MediaSchema.index({ ownerType: 1, ownerId: 1, subOwnerId: 1, isDeleted: 1 });

// Title and tag-based search
MediaSchema.index({ ownerType: 1, ownerId: 1, title: 1, isDeleted: 1 });
MediaSchema.index({ tags: 1, isDeleted: 1 });
