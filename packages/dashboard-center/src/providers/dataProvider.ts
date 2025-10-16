import type { DataProvider } from "@refinedev/core";

const emptyList = { data: [], total: 0 };
const emptyOne = { data: {} };

export const placeholderDataProvider: DataProvider = {
  getList: async () => emptyList,
  getMany: async () => ({ data: [] }),
  getOne: async () => emptyOne,
  create: async ({ variables }) => ({ data: variables ?? {} }),
  update: async ({ variables }) => ({ data: variables ?? {} }),
  deleteOne: async ({ id }) => ({ data: { id } }),
  getApiUrl: () => "/api",
  custom: async () => emptyOne,
};
