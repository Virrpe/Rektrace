import { EventEmitter } from 'node:events';

// Singleton event bus for internal alerts and guards
export const bus = new EventEmitter();

export type BreachEvent = { type: 'slo'|'breaker'|'credits'; note: string };


