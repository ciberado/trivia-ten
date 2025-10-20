import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// SPA fallback plugin for React Router
function spaFallback(): Plugin {
  return {
    name: "spa-fallback",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        const method = req.method || "GET";
        
        // Skip if not a GET request
        if (method !== "GET") {
          return next();
        }
        
        // Skip if it has a file extension, or is an API/socket/internal call
        if (
          /\.\w+(\?.*)?$/.test(url) ||
          url.startsWith("/api") ||
          url.startsWith("/socket.io") ||
          url.startsWith("/@") ||
          url.startsWith("/node_modules")
        ) {
          return next();
        }
        
        // Rewrite to index.html for SPA routes
        req.url = "/index.html";
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "automatic",
      jsxImportSource: "react",
      babel: {
        plugins: [],
      },
    }),
    spaFallback(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
      "/socket.io": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
        secure: false,
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          refine: ["@refinedev/core", "@refinedev/antd", "@refinedev/react-router-v6"],
          antd: ["antd"],
        },
      },
    },
  },
});
