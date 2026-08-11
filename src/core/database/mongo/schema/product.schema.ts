import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Query } from 'mongoose';
import { PriceType, ProductStatus } from 'src/shared/enums/product.enums';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ collection: 'product_master' })
export class Product {
  /* ================= IDENTITY ================= */
  @Prop({ required: true, trim: true, type: String })
  compCode!: string;

  @Prop({ required: true, trim: true, unique: true, type: String })
  productId!: string;

  @Prop({ required: true, trim: true, type: String })
  name!: string;

  @Prop({ required: true, trim: true, unique: true, type: String })
  productSysCode!: string;

  /* ================= ASSOCIATIONS ================= */

  @Prop({ required: true, type: String, ref: 'ProductCategory' })
  categoryId!: string;

  @Prop({ required: true, type: String, ref: 'ProductCategory' })
  parentCategoryId!: string;

  /* ================= PRICING ================= */

  @Prop({ required: true, type: Number })
  casePrice!: number;

  @Prop({ required: true, type: Number })
  piecePrice!: number;

  /* ================= WEIGHT ================= */

  @Prop({ required: true })
  caseNetWeight!: number; // ✅ SOURCE OF TRUTH

  @Prop({ required: true })
  pieceNetWeight!: number; // ⚠️ DERIVED (auto-calculated)

  @Prop({
    type: String,
    enum: PriceType,
    default: PriceType.STANDARD,
  })
  priceType!: PriceType;

  /* ================= UNIT ================= */

  @Prop({ type: String })
  unitType?: string;

  // @Prop({ type: String })
  // itemGroup?: string;

  // @Prop({ type: String })
  // itemsSubGroup?: string;

  @Prop({ type: String })
  unitSize?: string;

  @Prop({ type: String, enum: ['Y', 'N'], default: 'N' })
  isFocusedPack?: string;

  @Prop({ required: true, type: Number })
  unitQtyInCase!: number;

  /* ================= STATUS ================= */

  @Prop({
    type: String,
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
  })
  status!: ProductStatus;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.pre('save', function (next: any) {
  const doc: any = this;

  if (doc.casePrice && doc.unitQtyInCase) {
    doc.piecePrice = Number((doc.casePrice / doc.unitQtyInCase).toFixed(4));
  }

  if (doc.caseNetWeight && doc.unitQtyInCase) {
    doc.pieceNetWeight = Number(
      (doc.caseNetWeight / doc.unitQtyInCase).toFixed(4),
    );
  }

  next();
});

ProductSchema.pre(
  'findOneAndUpdate',
  async function (this: Query<any, any>, next: any) {
    const update: any = this.getUpdate() || {};
    const data = update.$set || update;

    const doc: any = await this.model.findOne(this.getQuery());

    if (!doc) return next();

    const casePrice = data.casePrice ?? doc.casePrice;
    const caseNetWeight = data.caseNetWeight ?? doc.caseNetWeight;
    const unitQtyInCase = data.unitQtyInCase ?? doc.unitQtyInCase;

    if (casePrice && unitQtyInCase) {
      const piecePrice = Number((casePrice / unitQtyInCase).toFixed(4));

      if (update.$set) {
        update.$set.piecePrice = piecePrice;
      } else {
        update.piecePrice = piecePrice;
      }
    }

    if (caseNetWeight && unitQtyInCase) {
      const pieceNetWeight = Number((caseNetWeight / unitQtyInCase).toFixed(4));

      if (update.$set) {
        update.$set.pieceNetWeight = pieceNetWeight;
      } else {
        update.pieceNetWeight = pieceNetWeight;
      }
    }

    next();
  },
);
