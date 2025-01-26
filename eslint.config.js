import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import solid from "eslint-plugin-solid/configs/typescript";

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ["**/*.{ts,tsx}"], ...solid },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
];
