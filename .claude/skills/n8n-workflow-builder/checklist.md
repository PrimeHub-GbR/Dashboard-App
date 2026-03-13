# N8N Workflow Builder Checklist

## Before Building
- [ ] Feature spec read and understood
- [ ] `list_workflows` executed — no duplicates
- [ ] Existing sub-workflows identified (isbn2ean, ean2bbp, etc.)
- [ ] Workflow name set: `[Dashboard] workflow-name` format
- [ ] Webhook path defined: `kebab-case`
- [ ] Input/output format defined
- [ ] Node structure sketched (Trigger → Processing → Callback)
- [ ] User has confirmed the design

## While Building

### Required Structure
- [ ] Webhook trigger: POST, responseMode = responseNode
- [ ] Input validation present (IF node or Code node)
- [ ] Every Code node has try/catch

### Error Handling
- [ ] Error callback on invalid input
- [ ] Error callback on failed sub-workflow call
- [ ] Error callback on failed upload
- [ ] Error callback always: `{ success: false, error: "..." }`

### Coding Style
- [ ] Language: JavaScript (not Python)
- [ ] No `console.log` in production code
- [ ] Variables: camelCase
- [ ] N8N expressions: `{{ $json.field }}` syntax

### Callback
- [ ] Success: `{ success: true, result_url, summary }`
- [ ] Error: `{ success: false, error: "..." }`
- [ ] Callback URL derived from input: `job_id` → `/api/jobs/{job_id}/callback`

## After Building
- [ ] Workflow name follows `[Dashboard] workflow-name` format
- [ ] Workflow has tag `claude-generated`
- [ ] Workflow activated via MCP (`active: true`)
- [ ] Smoke test: webhook called with valid minimal payload
- [ ] Smoke test: callback received successfully (job status = completed)
- [ ] Error test: webhook called with invalid payload → error callback received
- [ ] N8N execution log: no unexpected errors
- [ ] Workflow ID + webhook path documented in feature spec (`## N8N Workflow`)
- [ ] Git commit created: `feat(area/slug): Add N8N workflow [name]`
