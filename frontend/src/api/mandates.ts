import { api } from './client';
import type { Mandate } from './types';

export function loadActiveMandates(token: string): Promise<Mandate[]> {
  return api.checkout<Mandate[]>('/intent-mandates/active', token);
}

export function loadCategories(token: string): Promise<string[]> {
  return api.checkout<string[]>('/catalog/categories', token);
}

export function mandateFor(mandates: Mandate[], category: string | null): Mandate | null {
  if (!category) return mandates[0] ?? null;
  return mandates.find((mandate) => mandate.category === category) ?? null;
}

export function mandateById(mandates: Mandate[], id: number): Mandate | null {
  return mandates.find((mandate) => mandate.id === id) ?? null;
}

export function titleCase(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}
