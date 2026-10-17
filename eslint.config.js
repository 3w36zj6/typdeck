import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import solid from "eslint-plugin-solid/configs/typescript";

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ["**/*.{ts,tsx}"], ...solid },
  {
    files: ["src/client/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/client/**"],
    languageOptions: { globals: globals.node },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
];
