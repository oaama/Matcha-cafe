import { z } from 'zod';

export const customizationSchema = z.object({
  groupId: z.string(),
  optionIndex: z.number().int().nonnegative(),
});

export const orderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  notes: z.string().max(250).optional(),
  customizations: z.array(customizationSchema).default([]),
});

export const createOrderSchema = z.object({
  orderType: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']),
  tableNumber: z.string().trim().optional(),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerPhone: z.string().trim().min(4).max(30).optional(),
  customerAddress: z.string().trim().max(250).optional(),
  additionalAddressDetails: z.string().trim().max(250).optional(),
  deliveryInstructions: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(['cash', 'card']).optional().default('cash'),
  notes: z.string().max(250).optional(),
  items: z.array(orderItemSchema).min(1),
  idempotencyKey: z.string().trim().min(3).max(120).optional(),
}).superRefine((order, context) => {
  if (order.orderType === 'DINE_IN' && !order.tableNumber?.trim()) {
    context.addIssue({ code: 'custom', path: ['tableNumber'], message: 'Table number is required for dine-in orders.' });
  }
  if (order.orderType === 'DELIVERY') {
    if (!order.customerName?.trim()) {
      context.addIssue({ code: 'custom', path: ['customerName'], message: 'Customer name is required for delivery orders.' });
    }
    if (!order.customerPhone?.trim()) {
      context.addIssue({ code: 'custom', path: ['customerPhone'], message: 'Customer phone is required for delivery orders.' });
    }
    if (!order.customerAddress?.trim()) {
      context.addIssue({ code: 'custom', path: ['customerAddress'], message: 'Delivery address is required.' });
    }
  }
});

export const dashboardStatusSchema = z.object({
  status: z.enum(['NEW', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']),
});

export const pricingSettingsSchema = z.object({
  serviceEnabled: z.boolean(),
  serviceRate: z.number().finite().min(0).max(100),
  taxEnabled: z.boolean(),
  taxRate: z.number().finite().min(0).max(100),
});

const inventoryItemSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum(['product', 'ingredient']),
  productId: z.string().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(150),
  unit: z.string().trim().min(1).max(30),
  quantity: z.number().finite().min(0).max(1_000_000_000),
  lowStockThreshold: z.number().finite().min(0).max(1_000_000_000),
  trackStock: z.boolean(),
}).superRefine((item, context) => {
  if (item.type === 'product' && !item.productId) {
    context.addIssue({ code: 'custom', message: 'Product inventory must reference a product' });
  }
  if (item.type === 'ingredient' && item.productId) {
    context.addIssue({ code: 'custom', message: 'Ingredients cannot reference a product' });
  }
});

export const inventorySettingsSchema = z.object({
  items: z.array(inventoryItemSchema).max(6000),
  recipes: z.array(z.object({
    productId: z.string().min(1).max(100),
    ingredients: z.array(z.object({
      itemId: z.string().min(1).max(120),
      quantity: z.number().finite().positive().max(1_000_000),
    })).max(100),
  })).max(5000),
}).superRefine((inventory, context) => {
  const itemIds = new Set<string>();
  for (const item of inventory.items) {
    if (itemIds.has(item.id)) context.addIssue({ code: 'custom', message: `Duplicate inventory item: ${item.id}` });
    itemIds.add(item.id);
  }
  const products = new Set<string>();
  const ingredients = new Set(inventory.items.filter((item) => item.type === 'ingredient').map((item) => item.id));
  for (const item of inventory.items) {
    if (item.productId) {
      if (products.has(item.productId)) context.addIssue({ code: 'custom', message: `Duplicate product stock: ${item.productId}` });
      products.add(item.productId);
    }
  }
  const recipeProducts = new Set<string>();
  for (const recipe of inventory.recipes) {
    if (recipeProducts.has(recipe.productId)) context.addIssue({ code: 'custom', message: `Duplicate recipe: ${recipe.productId}` });
    recipeProducts.add(recipe.productId);
    const recipeIngredients = new Set<string>();
    for (const ingredient of recipe.ingredients) {
      if (!ingredients.has(ingredient.itemId)) {
        context.addIssue({ code: 'custom', message: `Unknown recipe ingredient: ${ingredient.itemId}` });
      }
      if (recipeIngredients.has(ingredient.itemId)) {
        context.addIssue({ code: 'custom', message: `Duplicate recipe ingredient: ${ingredient.itemId}` });
      }
      recipeIngredients.add(ingredient.itemId);
    }
  }
});

export const inventoryAdjustmentSchema = z.object({
  itemId: z.string().min(1).max(120),
  delta: z.number().finite().min(-1_000_000_000).max(1_000_000_000).refine((value) => value !== 0),
  note: z.string().trim().max(250).optional(),
});

const catalogGroupSchema = z.object({
  id: z.string().min(1).max(80),
  ar: z.string().trim().min(1).max(100),
  en: z.string().trim().max(100),
  required: z.boolean(),
  multi: z.boolean(),
  options: z.array(z.object({
    ar: z.string().trim().min(1).max(100),
    en: z.string().trim().max(100),
    price: z.number().finite().min(0).max(1_000_000),
    default: z.boolean().optional(),
  })).min(1).max(50),
});

export const catalogSchema = z.object({
  categories: z.array(z.object({
    id: z.string().min(1).max(80),
    ar: z.string().trim().min(1).max(100),
    en: z.string().trim().max(100),
    station: z.enum(['bar', 'kitchen']),
    displayOrder: z.number().int().nonnegative(),
    active: z.boolean(),
  })).max(100),
  products: z.array(z.object({
    id: z.string().min(1).max(100),
    categoryId: z.string().min(1).max(80),
    ar: z.string().trim().min(1).max(150),
    en: z.string().trim().max(150),
    descriptionAr: z.string().trim().max(500),
    descriptionEn: z.string().trim().max(500),
    price: z.number().finite().min(0).max(1_000_000),
    image: z.string().max(500).optional(),
    available: z.boolean(),
    bestSeller: z.boolean().optional(),
    featured: z.boolean().optional(),
    groups: z.array(z.string().min(1).max(80)).max(30),
    offerPrice: z.number().finite().min(0).max(1_000_000).optional(),
    displayOrder: z.number().int().nonnegative().optional(),
  })).max(5000),
  groups: z.record(z.string(), catalogGroupSchema),
}).superRefine((catalog, context) => {
  const categoryIds = new Set<string>();
  for (const category of catalog.categories) {
    if (categoryIds.has(category.id)) {
      context.addIssue({ code: 'custom', message: `Duplicate category id: ${category.id}` });
    }
    categoryIds.add(category.id);
  }

  const productIds = new Set<string>();
  for (const product of catalog.products) {
    if (productIds.has(product.id)) {
      context.addIssue({ code: 'custom', message: `Duplicate product id: ${product.id}` });
    }
    productIds.add(product.id);
    if (!categoryIds.has(product.categoryId)) {
      context.addIssue({ code: 'custom', message: `Unknown category for product: ${product.ar}` });
    }
    if (product.offerPrice !== undefined && product.offerPrice > product.price) {
      context.addIssue({ code: 'custom', message: `Offer price cannot exceed base price: ${product.ar}` });
    }
    for (const groupId of product.groups) {
      if (!catalog.groups[groupId]) {
        context.addIssue({ code: 'custom', message: `Unknown option group ${groupId} for product: ${product.ar}` });
      }
    }
  }

  for (const [key, group] of Object.entries(catalog.groups)) {
    if (key !== group.id) {
      context.addIssue({ code: 'custom', message: `Option group key does not match id: ${key}` });
    }
    const defaults = group.options.filter((option) => option.default).length;
    if (defaults > 1 || (group.required && !group.multi && defaults !== 1)) {
      context.addIssue({ code: 'custom', message: `Required single-choice group must have exactly one default option: ${group.ar}` });
    }
  }
});
