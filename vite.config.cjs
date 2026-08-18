const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react-swc");
const path = require("path");

// CommonJS config — loaded with require() to bypass esbuild entirely
// (avoids EACCES permission errors on the esbuild binary)
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
