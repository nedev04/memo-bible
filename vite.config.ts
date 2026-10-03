import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: './' — чтобы сборка работала на любом статическом хостинге (GitHub Pages и т.п.)
export default defineConfig({
  plugins: [react()],
  base: "./",
});
