import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "import-x": importX,
    },
    rules: {
      // Disable rules unrelated to imports
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",

      // Import rules
      "import-x/no-relative-packages": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message:
                "Relative parent imports are not allowed. Use absolute imports with @ aliases instead (e.g., @/audio, @ui/components).",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ["dist/**", "dist-showcase/**", "node_modules/**", "*.config.*"],
  }
);
