// lib/query-builders.ts
export function courseQuery(skill: string) {
  return [
    `"${skill}"`,
    "(course OR certificate OR specialization)",
    "(syllabus OR curriculum OR outline)",
    "-site:pinterest.* -site:facebook.com -site:quora.com -site:reddit.com",
  ].join(" ");
}

export function projectQuery(skill: string) {
  return [
    `"${skill}"`,
    '(project OR "build a" OR tutorial OR walkthrough)',
    "site:github.com OR site:dev.to OR site:hashnode.com OR site:medium.com",
  ].join(" ");
}
