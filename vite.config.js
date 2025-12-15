import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split Firebase into its own chunk
          firebase: ['firebase/compat/app', 'firebase/compat/auth', 'firebase/compat/firestore'],
          // Split FirebaseUI into its own chunk
          firebaseui: ['firebaseui'],
          // Split React into its own chunk
          react: ['react', 'react-dom'],
        },
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 600,
  },
})
