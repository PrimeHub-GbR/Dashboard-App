# General Project Rules

## Communication Language

**All responses to the user MUST be in German.** Code, filenames, and technical identifiers stay in English — but every explanation, question, or status update directed at the human is written in German.

## Feature Tracking
- All features are tracked in `features/INDEX.md` - read it before starting any work
- Feature specs live in `features/<tab>/<slug>.md` (Tab = Dashboard-Tab-Name)
  - Tabs: `workflow-hub`, `workflow-monitor`, `orders`, `prices`, `repricer`
  - Foundation features (no tab): `features/_foundation/<slug>.md`
- One feature per spec file (Single Responsibility)
- Never combine multiple independent functionalities in one spec
- New feature: choose tab folder → create spec file → add row in INDEX.md → Status: Planned

## Git Conventions
- Commit format: `type(area/slug): description`
  - Examples: `feat(repricer/dashboard): CSV upload`, `fix(orders/overview): pagination`
  - Areas: workflow-hub, workflow-monitor, orders, prices, repricer, foundation
- Types: feat, fix, refactor, test, docs, deploy, chore
- Check existing features before creating new ones: `cat features/INDEX.md`
- Check existing components before building: `git ls-files src/components/`
- Check existing APIs before building: `git ls-files src/app/api/`

## Human-in-the-Loop
- Always ask for user approval before finalizing deliverables
- Present options using clear choices rather than open-ended questions
- Never proceed to the next workflow phase without user confirmation

## Status Updates
- Update BOTH `features/INDEX.md` AND the spec header (`**Status:** ...`) on every transition
- Valid statuses and who sets them:
  | Status | Set by | Condition |
  |--------|--------|-----------|
  | `Planned` | requirements agent/skill | Spec created |
  | `In Progress` | architecture agent/skill | Tech Design written |
  | `In Review` | qa agent/skill | QA passed (APPROVED) |
  | `Deployed` | deploy agent/skill | Vercel build ● Ready |
- If QA is BLOCKED: status stays `In Progress` (not `In Review`)

## File Handling
- ALWAYS read a file before modifying it - never assume contents from memory
- After context compaction, re-read files before continuing work
- When unsure about current project state, read `features/INDEX.md` first
- Run `git diff` to verify what has already been changed in this session
- Never guess at import paths, component names, or API routes - verify by reading

## Handoffs Between Skills
- After completing a skill, suggest the next skill to the user
- Format: "Next step: Run `/skillname` to [action]"
- Handoffs are always user-initiated, never automatic
