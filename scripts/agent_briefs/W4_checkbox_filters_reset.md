# W4 — Checkbox filters, searchable faculties, reset, grading placeholder

GPT coordinates; Antigravity implements. Read AGENTS.md, docs/UI_STYLE_GUIDE.md and docs/DECISIONS.md. Current user explicitly wants multiple checkbox selections for credits/type/faculty, searchable scrollable faculty list like supplied reference, a reset filter button, and grading basis/final assessment ready for future data.

## Allowed files (edit/create ONLY these, no commit, no shell commands)
- web/src/components/FacetFilter.tsx
- web/src/app/modules/page.tsx
- web/src/lib/api.ts
- web/src/i18n/vi.ts
- web/src/i18n/en.ts
- web/src/components/__tests__/facetFilter.test.tsx (new)
- web/src/components/__tests__/moduleFilters.test.tsx (new if needed)
- api/app/routers/modules.py
- api/tests/test_module_multi_filters.py (new)

Do not alter unrelated changes already present. Do not execute shell commands. GPT will run checks. Do not touch data, database, migrations, credentials, Docker or other files.

## Current state
FacetFilter.tsx is currently a radio list (Props.value string/onChange). ModulesPage has scalar language/credits/faculty/type/semester state and paginates 30 records using ModuleFilter; API supports one value each. Faculty intentionally matches faculty OR department on server. Preserve that behavior. Facet counts are currently global. Existing default program filter from useMyProgramId and URL must remain. Existing English/Vietnamese names, descriptions, syllabus indicator, EquivalentsHover, semesters, pagination and API-error behavior must remain.

## Requirements
1. Add backward-compatible multiple mode to FacetFilter (values string[] and onValuesChange callback with discriminated props). Keep scalar mode for language/semester and any other consumers. Multiple mode uses real checkboxes, selecting a selected value deselects it. All/empty means no restriction; keyboard and accessible fieldset names. Faculty search must ignore Vietnamese accents, preserve selections when searching, scroll bounded list without overlaps. Selected options remain accessible even when query changes. Do not invent facet counts; counts from API are global, label this clearly.
2. ModulesPage uses multiple mode for credits, type, faculty/org. OR within each facet, AND between facets. Filtering and total count must work on all records on the SERVER before pagination, not only already-loaded results, no loading every module or Cartesian-product queries (faculty/department overlap would duplicate totals).
3. Extend API with optional comma-separated credits_in and type_in, and repeated faculty_in query values (faculty names may contain commas). Validate credits to 0..60, maintain single filters for backwards compatibility. Each selected organization matches faculty OR department. Build SQL OR/IN for each facet then AND with other filters, normal total and pagination unchanged. Extend frontend ModuleFilter and query serialization to support repeated arrays where required; preserve all other query builders/callers. Mock behavior must match these new filters if mocks enabled. Do not weaken auth/security or enable mocks by default.
4. Add visible full-width Reset filters button at top of filter panel. Disabled when no explicit facet filters active. Clears language/credits/type/faculty/semester/has_outline and faculty search, keeps search term and user's program context. Show selected-count and render VI/EN using existing i18n. Existing common.clear may be reused if label appropriate, else add keys. Do not reset user settings or program on this action.
5. Add section Grading basis / Đánh giá và cách tính điểm, plus final assessment / Đánh giá cuối kỳ with truthful empty/disabled state. No grading values are supplied by backend today; do not invent A-F/pass fail/method/weights or fake a functioning filter. Existing optional grading_basis/final_assessment fields in types may remain. This section is a placeholder awaiting data, not part of active filter count.
6. Avoid changing any existing test just to pass. Add meaningful tests: multi-select and deselect including reset/search persistence; server OR credits/type/org matching including overlapping organization matches with no duplicate total and pagination; single legacy filters still work. Use existing fixture conventions, temporary test DB only. UI integration test reset if practical. All UI labels support VI/EN.

## Definition of done / checks GPT will run
- Docker workspace web: npx tsc --noEmit, npm test, npm run lint.
- Docker workspace api: python -m pytest -q tests/test_module_multi_filters.py and relevant modules API tests.
- GPT reviews git diff of allowed files then opens http://localhost:3001/modules, selects multiple filters, checks reset and accurate count; verifies mobile filter list.
- No shell commands by Antigravity, no commit, no external downloads.
- Final output: exact files changed, semantics implemented, tests added, any limitations. Be explicit you did not run tests.
