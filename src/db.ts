import Dexie, { type EntityTable } from 'dexie';
import { Ingredient, Meal, Settlement } from './types';

const db = new Dexie('RoomieEatsDB') as Dexie & {
  ingredients: EntityTable<Ingredient, 'id'>;
  meals: EntityTable<Meal, 'id'>;
  settlements: EntityTable<Settlement, 'id'>;
};

// Schema definition:
// ++id is auto-incrementing primary key (but we use custom IDs in types)
// We specify the primary key 'id' for each table.
db.version(1).stores({
  ingredients: 'id, purchaserId, settledAt',
  meals: 'id, date, settledAt',
  settlements: 'id, date'
});

export { db };
