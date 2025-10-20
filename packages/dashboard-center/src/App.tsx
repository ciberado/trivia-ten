import { Refine } from "@refinedev/core";
import routerBindings, { NavigateToResource } from "@refinedev/react-router-v6";
import { ThemedLayoutV2, notificationProvider } from "@refinedev/antd";
import { App as AntApp, ConfigProvider, theme } from "antd";
import { Routes, Route, Outlet, Navigate } from "react-router-dom";

import { placeholderDataProvider } from "./providers/dataProvider";
import { placeholderLiveProvider } from "./providers/liveProvider";
import { RealtimeDashboard } from "./pages/realtime/RealtimeDashboard";
import { GameAnalyticsDashboard } from "./pages/game-analytics/GameAnalyticsDashboard";
import { PlayerInsightsDashboard } from "./pages/player-insights/PlayerInsightsDashboard";

export default function App(): JSX.Element {
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <AntApp>
        <Refine
          routerProvider={routerBindings}
          dataProvider={placeholderDataProvider}
          liveProvider={placeholderLiveProvider}
          notificationProvider={notificationProvider}
          resources={[
            {
              name: "realtime",
              list: "/realtime",
              meta: { label: "Realtime Operations" },
            },
            {
              name: "game-analytics",
              list: "/game-analytics",
              meta: { label: "Game Analytics" },
            },
            {
              name: "player-insights",
              list: "/player-insights",
              meta: { label: "Player Insights" },
            },
          ]}
          options={{
            syncWithLocation: true,
            warnWhenUnsavedChanges: false,
          }}
        >
          <Routes>
            <Route
              element={
                <ThemedLayoutV2>
                  <Outlet />
                </ThemedLayoutV2>
              }
            >
              <Route index element={<NavigateToResource resource="realtime" />} />
              <Route path="/realtime" element={<RealtimeDashboard />} />
              <Route
                path="/game-analytics"
                element={<GameAnalyticsDashboard />}
              />
              <Route
                path="/games-analytics"
                element={<Navigate to="/game-analytics" replace />}
              />
              <Route
                path="/player-insights"
                element={<PlayerInsightsDashboard />}
              />
            </Route>
            <Route path="*" element={<NavigateToResource resource="realtime" />} />
          </Routes>
        </Refine>
      </AntApp>
    </ConfigProvider>
  );
}
