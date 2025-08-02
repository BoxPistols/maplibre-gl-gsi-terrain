import typescriptParser from "@typescript-eslint/parser";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["src/**/*.{ts,tsx,js,jsx}", "example/**/*.{ts,tsx,js,jsx}"],
    ignores: [
      "node_modules/**",
      "dist/**",
      "demo/assets/**",
      "**/*.d.ts",
      "*.md",
      "docs/**/*.md",
      "README.md",
    ],
    plugins: {
      "@typescript-eslint": typescriptPlugin,
    },
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
      },
      globals: {
        // ブラウザ環境のグローバル変数
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        // Node.js環境のグローバル変数
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        // ES2021のグローバル変数
        Promise: "readonly",
        Map: "readonly",
        Set: "readonly",
        WeakMap: "readonly",
        WeakSet: "readonly",
        Proxy: "readonly",
        Reflect: "readonly",
        Symbol: "readonly",
        BigInt: "readonly",
        BigInt64Array: "readonly",
        BigUint64Array: "readonly",
      },
    },
    rules: {
      // 基本的なルール
      semi: ["error", "always"],
      quotes: ["error", "double"],
      "no-unused-vars": "warn",
      // TypeScript固有のルール
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
