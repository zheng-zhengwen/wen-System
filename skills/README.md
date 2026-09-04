# Bundled skills

These are the skills the awenops boards depend on (ASIN audit, ad-report audit,
Listing analysis). They are **seeded into `SKILLS_ROOT` (`~/.hermes/skills/`) on
every server startup, never overwriting an existing skill** — see
`server/app/core/skill_paths.py::seed_bundled_skills`.

So a fresh install gets them automatically; if you edit a skill in 「Skill 中心」
the on-disk copy wins and is never clobbered by this bundle.

Layout mirrors `SKILLS_ROOT`: `<category>/<skill-name>/SKILL.md` (+ assets).

| Skill | Used by |
|---|---|
| `amazon/amazon-asin-cosmo-rufus-audit` | 分析工具 → ASIN 审计；Listing 分析 |
| `amazon/zach-search-term-report-analyzer` | 分析工具 → 广告审计 |
| `amazon/amazon-listing-creative` | Listing 工作台 → AI 分析/文案/图片提示词 |
| `amazon/amazon-ad-campaign-optimization-xlsx` | 广告优化（xlsx 批量表） |
