import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Los <img> del dash son iconos PNG pequeños de valorant-api.com (agentes,
      // mapas, armas, tiers) y avatares: next/image no aporta aquí y añadiría
      // optimización/remotePatterns (y sharp) al deploy ARM.
      '@next/next/no-img-element': 'off',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scripts de soporte del host (riot-proxy es Node plano con require)
    "tools/**",
  ]),
]);

export default eslintConfig;
