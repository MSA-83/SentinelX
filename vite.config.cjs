const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react-swc");
const path = require("path");

// CommonJS config loaded via require() — bypasses the esbuild binary entirely.
// tsconfig.node.json no longer references vite.config.ts, so the platform
// will not regenerate that file and Vite will fall through to this .cjs entry.
module.exports = defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve("./src"),
    },
  },
});
