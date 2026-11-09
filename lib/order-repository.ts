import type { OrderRecord, OrderStatus } from './types';
import { getDataProvider } from './data-mode';
import { consumeInventoryForOrder, restoreInventoryForOrder } from './inventory-repository';

export interface OrderRepository {
  create(order: OrderRecord, idempotencyKey?: string): Promise<{ order: OrderRecord; created: boolean }>;
  createWithInventory(order: OrderRecord, idempotencyKey?: string): Promise<{ order: OrderRecord; created: boolean }>;
  list(): Promise<OrderRecord[]>;
  getById(id: string): Promise<OrderRecord | null>;
  updateStatus(
    id: string,
    currentStatus: OrderStatus,
    nextStatus: OrderStatus,
    updatedAt: string,
    attribution?: { shiftId: string; employeeId: string; employeeName: string },
  ): Promise<OrderRecord | null>;
}

type MockOrderStore = {
  orders: OrderRecord[];
  idempotencyKeys: Map<string, string>;
  pendingCreates: Map<string, Promise<{ order: OrderRecord; created: boolean }>>;
};

declare global {
  // Keeps mock orders available across Next.js development reloads.
  var matchaMockOrderStore: MockOrderStore | undefined;
}

const mockStore: MockOrderStore = globalThis.matchaMockOrderStore
  ?? (globalThis.matchaMockOrderStore = { orders: [], idempotencyKeys: new Map(), pendingCreates: new Map() });
mockStore.pendingCreates ??= new Map();

const mockRepository: OrderRepository = {
  async create(order, idempotencyKey) {
    const existingId = idempotencyKey ? mockStore.idempotencyKeys.get(idempotencyKey) : undefined;
    const existingOrder = existingId ? mockStore.orders.find((item) => item.id === existingId) : undefined;
    if (existingOrder) return { order: structuredClone(existingOrder), created: false };

    mockStore.orders.unshift(structuredClone(order));
    if (idempotencyKey) mockStore.idempotencyKeys.set(idempotencyKey, order.id);
    return { order: structuredClone(order), created: true };
  },
  async createWithInventory(order, idempotencyKey) {
    const existingId = idempotencyKey ? mockStore.idempotencyKeys.get(idempotencyKey) : undefined;
    const existingOrder = existingId ? mockStore.orders.find((item) => item.id === existingId) : undefined;
    if (existingOrder) return { order: structuredClone(existingOrder), created: false };
    const requestKey = idempotencyKey ?? `order:${order.id}`;
    const pending = mockStore.pendingCreates.get(requestKey);
    if (pending) return { ...(await pending), created: false };

    const creation = (async () => {
      const inventoryConsumption = await consumeInventoryForOrder(order);
      const storedOrder = { ...order, inventoryConsumption };
      mockStore.orders.unshift(structuredClone(storedOrder));
      if (idempotencyKey) mockStore.idempotencyKeys.set(idempotencyKey, order.id);
      return { order: structuredClone(storedOrder), created: true };
    })();
    mockStore.pendingCreates.set(requestKey, creation);
    try {
      return await creation;
    } finally {
      mockStore.pendingCreates.delete(requestKey);
    }
  },
  async list() {
    return structuredClone(mockStore.orders);
  },
  async getById(id) {
    const order = mockStore.orders.find((item) => item.id === id);
    return order ? structuredClone(order) : null;
  },
  async updateStatus(id, currentStatus, nextStatus, updatedAt, attribution) {
    const order = mockStore.orders.find((item) => item.id === id && item.status === currentStatus);
    if (!order) return null;
    if (nextStatus === 'CANCELLED' && currentStatus !== 'CANCELLED') await restoreInventoryForOrder(order);
    order.status = nextStatus;
    order.updatedAt = updatedAt;
    if (attribution && nextStatus === 'COMPLETED' && !order.shiftId) Object.assign(order, attribution);
    return structuredClone(order);
  },
};

const mongoRepository: OrderRepository = {
  async create(order, idempotencyKey) {
    const [{ connectToDatabase }, { OrderModel }] = await Promise.all([
      import('./database'),
      import('./order-model'),
    ]);
    await connectToDatabase();

    if (idempotencyKey) {
      const existingOrder = await OrderModel.findOne({ idempotencyKey })
        .select('-_id -__v -idempotencyKey')
        .lean();
      if (existingOrder) return { order: existingOrder as OrderRecord, created: false };
    }

    try {
      await OrderModel.create({ ...order, idempotencyKey });
      return { order, created: true };
    } catch (error) {
      if (idempotencyKey && (error as { code?: number }).code === 11000) {
        const existingOrder = await OrderModel.findOne({ idempotencyKey })
          .select('-_id -__v -idempotencyKey')
          .lean();
        if (existingOrder) return { order: existingOrder as OrderRecord, created: false };
      }
      throw error;
    }
  },
  async createWithInventory(order, idempotencyKey) {
    const [{ connectToDatabase }, { OrderModel }] = await Promise.all([
      import('./database'),
      import('./order-model'),
    ]);
    const connection = await connectToDatabase();
    const session = await connection.startSession();
    try {
      let result: { order: OrderRecord; created: boolean } | undefined;
      await session.withTransaction(async () => {
        if (idempotencyKey) {
          const existingOrder = await OrderModel.findOne({ idempotencyKey })
            .select('-_id -__v -idempotencyKey')
            .session(session)
            .lean();
          if (existingOrder) {
            result = { order: existingOrder as OrderRecord, created: false };
            return;
          }
        }

        const inventoryConsumption = await consumeInventoryForOrder(order, session);
        await OrderModel.create([{ ...order, inventoryConsumption, idempotencyKey }], { session });
        result = { order: { ...order, inventoryConsumption }, created: true };
      });
      if (!result) throw new Error('Unable to create order');
      return result;
    } catch (error) {
      if (idempotencyKey && (error as { code?: number }).code === 11000) {
        const existingOrder = await OrderModel.findOne({ idempotencyKey })
          .select('-_id -__v -idempotencyKey')
          .lean();
        if (existingOrder) return { order: existingOrder as OrderRecord, created: false };
      }
      throw error;
    } finally {
      await session.endSession();
    }
  },
  async list() {
    const [{ connectToDatabase }, { OrderModel }] = await Promise.all([
      import('./database'),
      import('./order-model'),
    ]);
    await connectToDatabase();
    return OrderModel.find()
      .select('-_id -__v -idempotencyKey')
      .sort({ createdAt: -1 })
      .lean() as unknown as OrderRecord[];
  },
  async getById(id) {
    const [{ connectToDatabase }, { OrderModel }] = await Promise.all([
      import('./database'),
      import('./order-model'),
    ]);
    await connectToDatabase();
    return await OrderModel.findOne({ id }).lean() as OrderRecord | null;
  },
  async updateStatus(id, currentStatus, nextStatus, updatedAt, attribution) {
    const [{ connectToDatabase }, { OrderModel }] = await Promise.all([
      import('./database'),
      import('./order-model'),
    ]);
    const connection = await connectToDatabase();
    const set: Partial<OrderRecord> = { status: nextStatus, updatedAt };
    if (attribution && nextStatus === 'COMPLETED') Object.assign(set, attribution);
    if (nextStatus !== 'CANCELLED') {
      return await OrderModel.findOneAndUpdate(
        { id, status: currentStatus },
        { $set: set },
        { new: true },
      ).select('-_id -__v -idempotencyKey').lean() as OrderRecord | null;
    }

    const existingOrder = await OrderModel.findOne({ id, status: currentStatus })
      .select('-_id -__v -idempotencyKey')
      .lean() as OrderRecord | null;
    if (!existingOrder) return null;
    if (!existingOrder.inventoryConsumption?.length) {
      return await OrderModel.findOneAndUpdate(
        { id, status: currentStatus },
        { $set: set },
        { new: true },
      ).select('-_id -__v -idempotencyKey').lean() as OrderRecord | null;
    }

    const session = await connection.startSession();
    try {
      let updatedOrder: OrderRecord | null = null;
      await session.withTransaction(async () => {
        const order = await OrderModel.findOne({ id, status: currentStatus }).session(session).lean() as OrderRecord | null;
        if (!order) return;
        if (currentStatus !== 'CANCELLED') await restoreInventoryForOrder(order, session);
        updatedOrder = await OrderModel.findOneAndUpdate(
          { id, status: currentStatus },
          { $set: { status: nextStatus, updatedAt } },
          { new: true, session },
        ).select('-_id -__v -idempotencyKey').lean() as OrderRecord | null;
      });
      return updatedOrder;
    } finally {
      await session.endSession();
    }
  },
};

export function getOrderRepository(): OrderRepository {
  return getDataProvider() === 'mock' ? mockRepository : mongoRepository;
}

export function clearMockOrders() {
  mockStore.orders = [];
  mockStore.idempotencyKeys.clear();
  mockStore.pendingCreates.clear();
}
