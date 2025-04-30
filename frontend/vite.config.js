import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on mode
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

  // Get environment variables
  const MONITOR_API_PORT = process.env.VITE_MONITOR_API_PORT || 3003;
  const FRONTEND_PORT = 3001;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
        '@config': path.resolve(__dirname, './src/config.js'),
      },
    },
    server: {
      port: FRONTEND_PORT,
      host: true, // Listen on all addresses
      cors: true, // Enable CORS
      proxy: {
        // Proxy all API requests to the backend
        '/api': {
          target: 'http://localhost:3003', // Explicitly use port 3003 for backend
          changeOrigin: true,
          secure: false,
          // This is the key change - match the API requests to root-level backend routes
          rewrite: (path) => {
            const newPath = path.replace(/^\/api/, '');
            console.log(`Proxy rewrite: ${path} -> ${newPath}`);
            return newPath;
          }
        }
      },
    },
    // Make environment variables available in the app
    define: {
      'process.env': process.env
    }
  };
}); 