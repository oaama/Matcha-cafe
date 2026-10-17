import mongoose, { Schema } from 'mongoose';
import type { OrderRecord } from './types';

type StoredOrder = OrderRecord & { idempotencyKey?: string };

const orderItemSchema = new Schema<OrderRecord['items'][number]>({
  productId: { type: String, required: true },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  nameAr: { type: String, required: true },
  nameEn: { type: String, required: true },
  selectedOptions: [{
    groupId: { type: String, required: true },
    optionAr: { type: String, required: true },
    optionEn: { type: String, required: true },
    price: { type: Number, required: true },
  }],
  notes: String,
}, { _id: false });

const orderSchema = new Schema<StoredOrder>({
  id: { type: String, required: true, unique: true },
  orderNumber: { type: String, required: true, unique: true },
  type: { type: String, enum: ['DINE_IN', 'TAKEAWAY'], required: true },
  status: { type: String, enum: ['NEW', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'], required: true },
  tableNumber: String,
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true },
  items: { type: [orderItemSchema], required: true },
  subtotal: { type: Number, required: true },
  serviceFee: { type: Number, required: true },
  tax: { type: Number, required: true },
  total: { type: Number, required: true },
  notes: String,
  customerName: String,
  customerPhone: String,
  customerAddress: String,
  paymentMethod: { type: String, enum: ['cash', 'card'] },
  inventoryConsumption: [{
    itemId: { type: String, required: true },
    quantity: { type: Number, required: true },
  }],
  idempotencyKey: { type: String, unique: true, sparse: true, select: false },
}, { versionKey: false, collection: 'orders' });

export const OrderModel = (mongoose.models.Order as mongoose.Model<StoredOrder> | undefined)
  ?? mongoose.model<StoredOrder>('Order', orderSchema);