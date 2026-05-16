import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  plugins: [
    tanstackRouter({
      target: "react",
      routesDirectory: "src/app/routes",
      generatedRouteTree: "src/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "es2023",
    sourcemap: true,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-dom") || /[\\/]react[\\/]/.test(id)) return "react-vendor";
          if (id.includes("@tanstack/react-router")) return "tanstack-router";
          if (id.includes("@tanstack/react-query")) return "tanstack-query";
          if (
            id.includes("react-hook-form") ||
            id.includes("@hookform/resolvers") ||
            /[\\/]zod[\\/]/.test(id)
          ) {
            return "vendor-forms";
          }
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("axios")) return "vendor-net";
          if (id.includes("pdfjs-dist")) return "vendor-pdf";
          if (id.includes("sonner")) return "vendor-toast";
          if (
            id.includes("@radix-ui") ||
            id.includes("class-variance-authority") ||
            id.includes("tailwind-merge") ||
            /[\\/]clsx[\\/]/.test(id)
          ) {
            return "vendor-ui";
          }
          if (id.includes("zustand")) return "vendor-state";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    css: true,
  },
});
