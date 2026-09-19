import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        // Pre-bundle livekit-client with esbuild, which handles its circular deps
        // safely (unlike Rollup scope-hoisting which causes TDZ at runtime).
        include: ['livekit-client'],
    },
    build: {
        target: 'es2018',
        cssTarget: 'safari13',
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) return;

                    // livekit-client has deep internal circular deps that Rollup
                    // scope-hoisting cannot safely inline — keep it isolated.
                    if (id.includes('livekit-client')) return 'vendor-livekit';

                    // Everything else goes into ONE vendor chunk.
                    //
                    // WHY A SINGLE CHUNK: splitting vendor into vendor-react /
                    // vendor-utils etc. creates circular chunk dependencies because
                    // react-router-dom (would go to vendor-react) depends on
                    // @remix-run/router (would go to vendor), which in turn imports
                    // from react. Rollup detects and warns about this cycle:
                    //   "Circular chunk: vendor -> vendor-react -> vendor"
                    // Circular chunk deps produce "Cannot access 'X' before
                    // initialization" TDZ crashes at runtime — the root cause of
                    // the recurring production errors. A single chunk eliminates
                    // this: Rollup resolves same-chunk circular deps with var
                    // declarations (no TDZ) instead of live cross-chunk bindings.
                    return 'vendor';
                },
            },
        },
    },
    server: {

        host: '0.0.0.0',
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://api:8000',
                changeOrigin: true,
            },
            '/ws': {
                target: 'ws://api:8000',
                ws: true,
            },
            '/health': {
                target: 'http://api:8000',
                changeOrigin: true,
            },
        },
    },
});
