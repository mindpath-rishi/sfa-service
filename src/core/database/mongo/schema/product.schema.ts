import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PriceType, ProductStatus } from 'src/shared/enums/product.enums';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ collection: 'product_master' })
export class Product {
  /* ================= IDENTITY ================= */

  @Prop({ required: true, trim: true, unique: true, type: String })
  productId: string;

  @Prop({ required: true, trim: true, type: String })
  name: string;

  @Prop({ required: true, trim: true, unique: true, type: String })
  productSysCode: string;

  /* ================= ASSOCIATIONS ================= */

  @Prop({ required: true, type: String, ref: 'ProductCategory' })
  categoryId: string;

  /* ================= PRICING ================= */

  @Prop({ required: true, type: Number })
  casePrice: number;

  @Prop({ required: true, type: Number })
  piecePrice: number;

  /* ================= WEIGHT ================= */

  @Prop({ required: true })
  caseWeight: number; // ✅ SOURCE OF TRUTH

  @Prop({ required: true })
  pieceWeight: number; // ⚠️ DERIVED (auto-calculated)

  @Prop({
    type: String,
    enum: PriceType,
    default: PriceType.STANDARD,
  })
  priceType: PriceType;

  /* ================= UNIT ================= */

  @Prop({ type: String })
  unitType?: string;

  @Prop({ type: String })
  unitSize?: string;

  @Prop({ required: true, type: Number })
  unitQtyInCase: number;

  /* ================= STATUS ================= */

  @Prop({
    type: String,
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
  })
  status: ProductStatus;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.pre('save', function (next: Function) {
  const doc = this as any;

  if (doc.casePrice && doc.unitQtyInCase) {
    doc.piecePrice = doc.casePrice / doc.unitQtyInCase;
  }

  next();
});

ProductSchema.pre('findOneAndUpdate', async function (next: Function) {
  const update: any = this.getUpdate();

  const doc: any = await this.model.findOne(this.getQuery());

  const casePrice = update.casePrice ?? doc?.casePrice;
  const unitQtyInCase = update.unitQtyInCase ?? doc?.unitQtyInCase;

  if (casePrice && unitQtyInCase) {
    update.piecePrice = casePrice / unitQtyInCase;
  }

  next();
});

ProductSchema.pre('save', function (next: Function) {
  const doc: any = this as any;

  if (doc.caseWeight && doc.unitQtyInCase) {
    doc.pieceWeight = Number((doc.caseWeight / doc.unitQtyInCase).toFixed(4));
  }

  next();
});

ProductSchema.pre('findOneAndUpdate', async function (next: Function) {
  const update: any = this.getUpdate();
  const data = update.$set || update;

  const doc: any = await this.model.findOne(this.getQuery());

  const caseWeight = data.caseWeight ?? doc?.caseWeight;
  const unitQtyInCase = data.unitQtyInCase ?? doc?.unitQtyInCase;

  if (caseWeight && unitQtyInCase) {
    const pieceWeight = Number((caseWeight / unitQtyInCase).toFixed(4));

    if (update.$set) {
      update.$set.pieceWeight = pieceWeight;
    } else {
      update.pieceWeight = pieceWeight;
    }
  }

  next();
});
