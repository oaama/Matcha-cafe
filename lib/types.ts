export type OrderStatus = 'NEW' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

export type CatalogGroup = {
  id: string;
  ar: string;
  en: string;
  required: boolean;
  multi: boolean;
  options: Array<{ ar: string; en: string; price: number; default?: boolean }>;
};

export type Product = {
  id: string;
  categoryId: string;
  ar: string;
  en: string;
  descriptionAr: string;
  descriptionEn: string;
  price: number;
  image?: string;
  available: boolean;
  bestSeller?: boolean;
  featured?: boolean;
  groups: string[];
  offerPrice?: number;
  displayOrder?: number;
};

export type Category = {
  id: string;
  ar: string;
  en: string;
  station: 'bar' | 'kitchen';
  displayOrder: number;
  active: boolean;
};

export type OrderItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
  nameAr: string;
  nameEn: string;
  selectedOptions: Array<{ groupId: string; optionAr: string; optionEn: string; price: number }>;
  notes?: string;
};

export type InventoryConsumption = {
  itemId: string;
  quantity: number;
};

export type OrderRecord = {
  id: string;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  tableNumber?: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  subtotal: number;
  serviceFee: number;
  tax: number;
  total: number;
  notes?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  additionalAddressDetails?: string;
  deliveryInstructions?: string;
  paymentMethod?: 'cash' | 'card';
  inventoryConsumption?: InventoryConsumption[];
};

export type InventoryItem = {
  id: string;
  type: 'product' | 'ingredient';
  productId?: string;
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
  trackStock: boolean;
};

export type ProductRecipe = {
  productId: string;
  ingredients: Array<{ itemId: string; quantity: number }>;
};

export type InventoryMovement = {
  id: string;
  itemId: string;
  itemName: string;
  itemType: InventoryItem['type'];
  quantity: number;
  reason: 'adjustment' | 'sale' | 'cancellation';
  referenceId?: string;
  note?: string;
  createdAt: string;
};
