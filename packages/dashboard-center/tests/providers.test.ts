import test from "node:test";
import assert from "node:assert/strict";

import { placeholderDataProvider } from "../src/providers/dataProvider.js";
import { placeholderLiveProvider } from "../src/providers/liveProvider.js";

test("placeholder data provider returns empty list", async () => {
  const result = await placeholderDataProvider.getList({
    resource: "rooms",
    pagination: { current: 1, pageSize: 10 },
    filters: [],
    sorters: [],
    meta: {},
  });

  assert.deepEqual(result, { data: [], total: 0 });
});

test("placeholder data provider getApiUrl returns /api", () => {
  assert.equal(placeholderDataProvider.getApiUrl?.(), "/api");
});

test("placeholder live provider subscribes without error", () => {
  const subscription = placeholderLiveProvider.subscribe({
    channel: "rooms",
    types: ["*"],
    params: {},
    callback: () => {
      // noop
    },
  });

  assert.ok(subscription);
  assert.equal(typeof subscription.unsubscribe, "function");
  subscription.unsubscribe();
});
