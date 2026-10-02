import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Reading a `const` before the line that declares it throws
      // "Cannot access 'x' before initialization" the moment the code runs.
      // Nothing in the default Next config catches that, and on this site it
      // cost a release: TimeAxis filtered events against a `rangeEnd` declared
      // below the filter, which only runs in the browser because the events
      // arrive in useEffect — so the build, the type check and the 200 response
      // were all green while the page showed nothing but an error boundary.
      "no-use-before-define": ["error", { variables: true, functions: false, classes: false }],
    },
  },
  {
    // Both of these reference a module-level `const input` from inside a
    // component body, so the declaration is evaluated at module init — long
    // before any render. Reported by the rule, not a runtime hazard.
    files: ["components/AdminPanel.tsx", "components/EventForm.tsx"],
    rules: { "no-use-before-define": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;