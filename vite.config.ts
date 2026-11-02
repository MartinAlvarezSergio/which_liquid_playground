import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/which_liquid_playground/",
  plugins: [react()]
});
