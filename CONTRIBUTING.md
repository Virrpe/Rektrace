## Contributing

### Checklist
- Tests green: `pnpm test:all`
- No API shape changes; maintain demo wall guarantees
- Update docs if behavior changes: API.md, OPERATIONS.md, TELEGRAM.md
- Security: never commit secrets; update `.env.prod.sample` if new required keys

### Development
- Demo: `pnpm dev:demo`
- Local bot: `pnpm dev:local`
- Run docs check: `pnpm docs:check`

### PR Guidelines
- Keep edits surgical (≤5 lines/file) unless creating docs
- Describe risk and mitigation; link related docs updates


