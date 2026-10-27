import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

// Flat-Config fuer ESLint 9 / Next 16 (`next lint` gibt es nicht mehr).
// Regelsatz wie die fruehere .eslintrc.json: nur next/core-web-vitals.
export default defineConfig([
  ...nextVitals,
  {
    // Neu mit eslint-plugin-react-hooks 7 (React-Compiler-Regeln). Bestehender Code
    // verstoesst an mehreren Stellen; vorerst sichtbar als Warnung statt Build-Blocker.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // n8n-Code-Schnipsel zum Einfuegen, kein Projektcode
    'docs/**',
  ]),
])
