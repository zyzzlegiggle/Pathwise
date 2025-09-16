// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ✅ define compat so you can use legacy "extends" configs
const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
});

export default [
  // next/core-web-vitals and next/typescript come from the legacy system
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // add your own custom rules
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowObjectTypes: "always" },
      ],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": false, // set to true if you want to allow @ts-ignore
          "ts-nocheck": true,
          "ts-check": true,
        },
      ],
    },
  },
];
