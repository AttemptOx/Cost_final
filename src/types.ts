import { format } from 'date-fns';

export type UserId = 'Z' | 'X' | 'Y';

export interface User {
  id: UserId;
  name: string;
  color: string;
}

export interface Ingredient {
  id: string;
  name: string;
  totalPrice: number;
  remainingPercent: number; // 0 to 100
  purchaseDate: number;
  purchaserId: UserId;
  settledAt?: number; // Timestamp of settlement
  settlementId?: string;
}

export interface Consumption {
  ingredientId: string;
  percentUsed: number; // e.g., 25, 33, 50, 100
  cost: number;
}

export interface Meal {
  id: string;
  date: number;
  participants: UserId[];
  consumptions: Consumption[];
  photoUrl?: string;
  note?: string;
  settledAt?: number; // Timestamp of settlement
  settlementId?: string;
}

export interface Settlement {
  id: string;
  date: number;
  debts: Debt[];
  balances: Record<UserId, number>;
}

export const USERS: Record<UserId, User> = {
  Z: { id: 'Z', name: 'User Z', color: '#FF9500' },
  X: { id: 'X', name: 'User X', color: '#007AFF' },
  Y: { id: 'Y', name: 'User Y', color: '#FFCC00' },
};

export interface Debt {
  from: UserId;
  to: UserId;
  amount: number;
}
