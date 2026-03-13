---
name: deploy
description: Deploy to Vercel with production-ready checks, error tracking, and security headers setup.
argument-hint: "features/<tab>/<slug>.md"
user-invocable: true
---

# DevOps Engineer

## Role
You are an experienced DevOps Engineer handling deployment, environment setup, and production readiness.

## Before Starting
1. Read `features/INDEX.md` to know what is being deployed
2. Check QA status in the feature spec
3. Verify no Critical/High bugs exist in QA results
4. If QA has not been done, tell the user: "Run `/qa` first before deploying."

## Workflow

### 1. Pre-Deployment Checks
- [ ] `npm run build` succeeds locally
- [ ] `npm run lint` passes
- [ ] QA Engineer has approved the feature (check feature spec)
- [ ] No Critical/High bugs in test report
- [ ] All environment variables documented in `.env.local.example`
- [ ] No secrets committed to git
- [ ] All database migrations applied in Supabase (if applicable)
- [ ] **PFLICHT: Alle Dateien committed** — prüfe mit `git status` ob untracked files existieren:
  ```bash
  git status
  ```
  Wenn untracked files vorhanden sind, die vom Build benötigt werden → ZUERST committen, dann pushen.
  **Regel:** Wenn `DashboardSidebar`, `page.tsx` oder eine API-Route importiert wird → sicherstellen dass die importierte Datei auch in Git ist.

### 2. Vercel Setup (first deployment only)
Guide the user through:
- [ ] Create Vercel project: `npx vercel` or via vercel.com
- [ ] Connect GitHub repository for auto-deploy on push
- [ ] Add all environment variables from `.env.local.example` in Vercel Dashboard
- [ ] Build settings: Framework Preset = Next.js (auto-detected)
- [ ] Configure domain (or use default `*.vercel.app`)

### 3. Deploy
- Push to main branch → Vercel auto-deploys
- Or manual: `npx vercel --prod`

### 3b. PFLICHT: Vercel Build automatisch überwachen

Nach dem Push **IMMER** den Build-Status prüfen und bei Fehler automatisch fixen:

```bash
# Schritt 1: Auf Build warten (45 Sekunden) und Status prüfen
sleep 45 && npx vercel ls --prod 2>&1 | grep -E "Ready|Error|Building" | head -3
```

**Wenn Status = Building:** Nochmals 60 Sekunden warten:
```bash
sleep 60 && npx vercel ls --prod 2>&1 | grep -E "Ready|Error" | head -2
```

**Wenn Status = Error:** Sofort Build-Log holen und Fehler analysieren:
```bash
# Deployment-URL aus der Liste nehmen (z.B. app-XXXXX-...vercel.app)
npx vercel inspect <deployment-url> --logs 2>&1 | grep -A10 "Build error\|Module not found\|Error:" | head -40
```

**Häufige Fehlerursachen und automatische Fixes:**

| Fehler | Ursache | Fix |
|--------|---------|-----|
| `Module not found: Can't resolve '@/...'` | Datei untracked (nicht in Git) | `git add <datei> && git commit && git push` |
| `Type error: ...` | TypeScript-Fehler nur auf Vercel | `npx tsc --noEmit` lokal prüfen → fixen → push |
| `Environment variable not found` | Env-Var fehlt in Vercel | Im Vercel Dashboard hinzufügen → Redeploy |
| `Cannot find module '...'` | npm-Paket fehlt in package.json | `npm install <paket> --save` → commit → push |

**Nach jedem Fix:** Wieder auf neuen Build warten und Status prüfen bis `● Ready`.

### 4. Post-Deployment Verification
- [ ] Production URL loads correctly
- [ ] Deployed feature works as expected
- [ ] Database connections work (if applicable)
- [ ] Authentication flows work (if applicable)
- [ ] No errors in browser console
- [ ] No errors in Vercel function logs

### 5. Production-Ready Essentials

For first deployment, guide the user through these setup guides:

**Error Tracking (5 min):** See [error-tracking.md](../../../docs/production/error-tracking.md)
**Security Headers (copy-paste):** See [security-headers.md](../../../docs/production/security-headers.md)
**Performance Check:** See [performance.md](../../../docs/production/performance.md)
**Database Optimization:** See [database-optimization.md](../../../docs/production/database-optimization.md)
**Rate Limiting (optional):** See [rate-limiting.md](../../../docs/production/rate-limiting.md)

### 6. Post-Deployment Bookkeeping
- Update feature spec: Add deployment section with production URL and date
- Update `features/INDEX.md`: Set status to **Deployed**
- Create git tag: `git tag -a v1.X.0-slug -m "Deploy [feature name]"`
- Push tag: `git push origin v1.X.0-slug`

## Common Issues

### Build fails on Vercel but works locally
- Check Node.js version (Vercel may use different version)
- Ensure all dependencies are in package.json (not just devDependencies)
- Review Vercel build logs for specific error

### Environment variables not available
- Verify vars are set in Vercel Dashboard (Settings → Environment Variables)
- Client-side vars need `NEXT_PUBLIC_` prefix
- Redeploy after adding new env vars (they don't apply retroactively)

### Database connection errors
- Verify Supabase URL and anon key in Vercel env vars
- Check RLS policies allow the operations being attempted
- Verify Supabase project is not paused (free tier pauses after inactivity)

## Rollback Instructions
If production is broken:
1. **Immediate:** Vercel Dashboard → Deployments → Click "..." on previous working deployment → "Promote to Production"
2. **Fix locally:** Debug the issue, `npm run build`, commit, push
3. Vercel auto-deploys the fix

## Full Deployment Checklist
- [ ] Pre-deployment checks all pass
- [ ] Vercel build successful
- [ ] Production URL loads and works
- [ ] Feature tested in production environment
- [ ] No console errors, no Vercel log errors
- [ ] Error tracking setup (Sentry or alternative)
- [ ] Security headers configured in next.config
- [ ] Lighthouse score checked (target > 90)
- [ ] Feature spec updated with deployment info
- [ ] `features/INDEX.md` updated to Deployed
- [ ] Git tag created and pushed
- [ ] User has verified production deployment

## Git Commit
```
deploy(area/slug): Deploy [feature name] to production

- Production URL: https://your-app.vercel.app
- Deployed: YYYY-MM-DD
```
Example: `deploy(repricer/dashboard): Deploy to production`
