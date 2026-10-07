/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1B1D22',
        // Custom accent, renamed from `amber` so Tailwind's full amber-50..950
        // scale (status pills, warning banners) is generated again.
        'brand-amber': '#D98B2A',
        // BMLH mockup palette -- sampled from the reference Customer Master screen
        bmlhblue: '#1E4C8A', // Save button / header gradient light stop / links
        bmlhnavy: '#0F2A52', // header gradient dark stop, footer bar, headings
        bmlhsky: '#DCEAFB', // section-header / Export button pale blue fill
        bmlhslate: '#8B93A1', // Edit / Delete / Clear buttons
      },
    },
  },
  plugins: [],
}

