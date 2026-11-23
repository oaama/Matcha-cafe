export type PurchaseInvoiceStatus = 'DRAFT' | 'APPROVED' | 'CANCELLED';

export type PurchaseInvoiceItem = {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type PurchaseInvoiceHistoryEntry = {
  action: 'CREATED' | 'UPDATED' | 'APPROVED' | 'CANCELLED';
  actorId: string;
  actorName: string;
  at: string;
};

export type PurchasePaymentMethod = 'cash' | 'credit' | 'partial';

export type PurchaseInvoice = {
  id: string;
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  items: PurchaseInvoiceItem[];
  total: number;
  paymentMethod?: PurchasePaymentMethod;
  paidAmount?: number;
  notes?: string;
  status: PurchaseInvoiceStatus;
  createdById: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  approvedById?: string;
  approvedBy?: string;
  approvedAt?: string;
  cancelledById?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  history: PurchaseInvoiceHistoryEntry[];
};
