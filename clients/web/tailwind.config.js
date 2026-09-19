/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                v2: {
                    bg: 'var(--v2-bg)',
                    header: 'var(--v2-header)',
                    accent: 'var(--v2-accent)',
                    accentHover: 'var(--v2-accent-hover)',
                    text: 'var(--v2-text)',
                    muted: 'var(--v2-text-muted)',
                    border: 'var(--v2-border)',
                    background: 'var(--v2-bg)',
                }
            },
            borderRadius: {
                'v2': '0.5rem',
            },
            fontFamily: {
                'inter': ['Inter', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
