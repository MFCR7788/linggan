# Task Plan

Goal: Bring the LingJi project into a healthier, more complete state by fixing broken code paths, aligning schema/API/frontend behavior, and making automated checks pass.

## Phases

1. Baseline and blockers - complete
   - Record current test/type failures.
   - Identify high-confidence runtime blockers from code.

2. Repair compile and test failures - complete
   - Fix TypeScript syntax/global issues.
   - Align video generation tests or implementation with current behavior.

3. Fix core runtime inconsistencies - complete
   - Repair hotspot job insert data.
   - Normalize hotspot status values across API/types/schema-facing code.
   - Fix migration SQL typos that would block setup.

4. Run verification loop - complete
   - Run TypeScript.
   - Run unit tests.
   - Run production build if feasible.

5. Polish and summarize - complete
   - Review modified files for accidental churn.
   - Document remaining risks and next steps.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| `src/app/api/sms/send-code/route.ts(22,1): Cannot find name 'n'` | Baseline typecheck | Removed stray `n` |
| `afterEach` and `afterAll` missing in `src/test/ai-services.test.ts` | Baseline typecheck | Imported globals from Vitest |
| Video generation test expects string `content`, implementation sends array plus extra fields | Baseline tests | Aligned implementation with existing test/API error expectation |
| `next/font` failed to fetch Inter from Google Fonts during build | Production build | Removed runtime Google font dependency and used local system font stack |
| `next lint` entered interactive setup because ESLint config was missing | Lint verification | Added `.eslintrc.json` and fixed resulting lint errors/warnings |

## Final Verification

- `npm test`: pass, 25 tests.
- `npx tsc --noEmit`: pass.
- `npm run lint`: pass, no warnings or errors.
- `npm run build`: pass.
