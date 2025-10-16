import type { LiveProvider } from "@refinedev/core";

function noop() {
  // placeholder no-op
}

function buildSubscription() {
  return {
    unsubscribe: () => {
      noop();
    },
  };
}

export const placeholderLiveProvider: LiveProvider = {
  subscribe: (_params) => buildSubscription(),
  unsubscribe: () => Promise.resolve(),
  publish: async () => {
    noop();
  },
};
