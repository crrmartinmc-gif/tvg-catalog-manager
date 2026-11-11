export type PaymentMethod = "Efectivo" | "Transferencia" | "Tarjeta" | "Otro";
export type SaleLine = {
  productId: string;
  sku: string;
  name: string;
  variant: string;
  quantity: number;
  unitPrice: number;
  total: number;
};
export type Sale = {
  id: string;
  number: string;
  sequence: number;
  createdAt: string;
  customer: string;
  document: string;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  change?: number;
  items: SaleLine[];
  total: number;
  requestHash: string;
  receiptType: "internal";
};
export type SaleRequest = {
  id: string;
  version: string;
  items: { productId: string; quantity: number }[];
  customer: string;
  document: string;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  expectedTotal: number;
};
export const paymentMethods: PaymentMethod[] = [
  "Efectivo",
  "Transferencia",
  "Tarjeta",
  "Otro",
];
export function validSale(value: unknown): value is Sale {
  if (!value || typeof value !== "object") return false;
  const s = value as Sale;
  return (
    typeof s.id === "string" &&
    typeof s.number === "string" &&
    Number.isSafeInteger(s.sequence) &&
    typeof s.createdAt === "string" &&
    Number.isFinite(Date.parse(s.createdAt)) &&
    typeof s.customer === "string" &&
    typeof s.document === "string" &&
    paymentMethods.includes(s.paymentMethod) &&
    s.receiptType === "internal" &&
    Number.isFinite(s.total) &&
    s.total >= 0 &&
    Array.isArray(s.items) &&
    s.items.length > 0 &&
    s.items.every(
      (i) =>
        i &&
        typeof i.productId === "string" &&
        typeof i.sku === "string" &&
        typeof i.name === "string" &&
        typeof i.variant === "string" &&
        Number.isSafeInteger(i.quantity) &&
        i.quantity > 0 &&
        Number.isFinite(i.unitPrice) &&
        i.unitPrice >= 0 &&
        Number.isFinite(i.total) &&
        i.total >= 0,
    )
  );
}
export class SaleError extends Error {
  constructor(
    message: string,
    public readonly uncertain: boolean,
  ) {
    super(message);
    this.name = "SaleError";
  }
}
