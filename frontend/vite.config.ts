import { defineConfig } from 'vite'

export default defineConfig({
    server: {
        port: 5173,
        proxy: {
            '/detect': 'http://localhost:8000',
            '/health': 'http://localhost:8000',
        }
    }
})
