# W4c — test isolation repair only
No shell, no commit. Only allowed files web/src/components/__tests__/facetFilter.test.tsx and web/src/components/__tests__/moduleFilters.test.tsx. Do not edit production code (W5 running there).
Verified W4b: tsc PASS; API test_module_multi_filters.py5 PASS. Frontend9 failed132 passed. JSON diagnostic data/w4-tests.json.
Root cause observed: rendered components leak across tests because vitest has globals disabled and test files do not register cleanup. Errors all Found multiple elements e.g Khoa Kinh te, All, searchbox, K23406. Add explicit afterEach(cleanup) to these two files, reset any settings/i18n state in test isolation. Do NOT weaken queries to getAllBy or first(). Keep actual assertions. Current shared vitest.setup.ts only imports jest-dom; do not edit global setup.
Read only relevant test files and vitest config/setup; make minimal fix quickly. GPT runs npx vitest run those2 tests and npm test. Report; don't run shell.
