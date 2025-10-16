import type { DataProvider } from "@refinedev/core";

export const placeholderDataProvider = {
  getList: async () => ({ data: [], total: 0 }),
  getMany: async () => ({ data: [] }),
  getOne: async () => ({ data: {} }),
  create: async ({ variables }: { variables?: unknown }) => ({
    data: variables ?? {},
  }),
  update: async ({ variables }: { variables?: unknown }) => ({
    data: variables ?? {},
  }),
  deleteOne: async ({ id }: { id: unknown }) => ({ data: { id } }),
  getApiUrl: () => "/api",
  custom: async () => ({ data: {} }),
} as DataProvider;
