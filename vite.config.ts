import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://<user>.github.io/management_sim/ on GitHub Pages; "/" for local dev.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/management_sim/' : '/',
  plugins: [react()],
}));
