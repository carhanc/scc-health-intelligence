// Shared ESLint flat config for Santa Clara Health Intelligence workspaces.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    ignores: [
      "**/.next/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
    ],
  },
];
