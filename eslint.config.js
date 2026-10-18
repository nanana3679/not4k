import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  // flat config는 .gitignore를 읽지 않는다. 메인 체크아웃의 .claude/·.worktrees/·.dev/에는 다른 워크트리가
  // 통째로 들어 있어 제외하고, Vite 캐시(.vite/, dev 서버의 사전 번들 의존성)도 제외한다. output/에서는
  // 서드파티 vendor 파일만 제외한다(src/game/renderer/flight/breakthrough.mjs가 output/prototypes를 import하므로 나머지는 검사한다).
  { ignores: ["dist", "dist-lab", ".vite", "output/**/vendor/**", ".claude/**", ".worktrees/**", ".dev/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
