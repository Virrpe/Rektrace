## Summary

Briefly describe the change.

## Checklist
- [ ] Build passes: `pnpm run build`
- [ ] Tests pass: `pnpm run test`
- [ ] Env lint: `pnpm run env:lint`
- [ ] Preflight: `pnpm run preflight`
- [ ] Oracle/Fuzz/Chaos (as appropriate): `pnpm run oracle:scan && pnpm run fuzz:scan && pnpm run chaos:smoke`
- [ ] No secrets in diff; logs redact sensitive data
- [ ] Contracts unchanged (HTTP/Telegram)

## Summary

## Changes

## Risk
- [ ] Low  - tests/docs only
- [ ] Med  - minor behavioral change (documented)
- [ ] High - needs canary

## Checklist
- [ ] Tests green (`pnpm test:all`)
- [ ] Docs updated (API/OPS/CONFIG/TELEGRAM/CHANGELOG)
- [ ] No secrets in code or logs
- [ ] Demo wall preserved


