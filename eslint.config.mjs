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

      // A leading underscore means "this parameter exists to satisfy a signature, not
      // because the function reads it".
      //
      // Load-bearing rather than cosmetic. DiscoverySource.fetch takes
      // (location, opts); Hack2Skill publishes one global listing and ignores
      // the location, so its adapter must still declare the parameter to stay
      // assignable to that interface. Without the convention the only ways to
      // satisfy the rule are to read the value or drop the parameter, and both
      // are worse: one is a fake reference, the other is a type error.
      //
      // This has to be the @typescript-eslint variant, not the base rule.
      // eslint-config-next sets the base rule to "off" and enables the
      // TS-aware one instead; naming the base rule here switched it back on and
      // it then reported five unused callback parameters the TS rule correctly
      // ignores, so the fix appeared to introduce warnings rather than remove
      // one.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
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