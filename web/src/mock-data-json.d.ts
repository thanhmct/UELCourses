// Local mock datasets are intentionally gitignored. These declarations let production
// type-checking proceed after webpack discards the disabled mock-only imports.
declare module "@/data/programs_catalog.json" {
  const catalog: {
    summaries: unknown;
    details: unknown;
  };
  export default catalog;
}

declare module "@/data/courses.json" {
  const courses: unknown;
  export default courses;
}

declare module "@/data/courses_2026_2027_planned.json" {
  const courses: unknown;
  export default courses;
}

declare module "@/data/mis_standard_curriculum.json" {
  const curriculum: unknown;
  export default curriculum;
}
