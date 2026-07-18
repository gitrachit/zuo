// Shared flat config. Packages without their own eslint.config.* (packages/*,
// apps/mobile) resolve up to this one; apps/web keeps its Next-specific config.
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.expo/**",
      "**/.turbo/**",
      "apps/web/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // CLAUDE.md: no `any` without a `// why` comment — enforce the default ban;
      // justified escapes use eslint-disable-next-line with the why.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
