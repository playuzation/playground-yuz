import { storeContract } from '@playground/core/store-contract';
import { SqliteStore } from './sqlite-store.ts';

storeContract('SqliteStore', () => new SqliteStore(':memory:'));
