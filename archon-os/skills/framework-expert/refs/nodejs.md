> Framework reference: Node.js. Loaded on demand by the framework-expert bundle.

# Node.js Expert — Gotchas & Decisions

Use Context7 for Express/NestJS/Fastify docs.

## Key Decisions

```toon
decisions[4]{choice,use_when}:
  Express vs NestJS vs Fastify,"Express: simple APIs. NestJS: enterprise/DI/decorators. Fastify: high perf"
  Prisma vs TypeORM vs Drizzle,"Prisma: best DX/types. TypeORM: Active Record pattern. Drizzle: SQL-like + lightweight"
  Zod vs Joi vs class-validator,"Zod: TS-first inference. Joi: runtime schemas. class-validator: NestJS decorators"
  JWT vs session,"JWT: stateless/microservices. Session: monolith/server-rendered"
```

## Gotchas

- `forEach` + `async`: does NOT await. Use `for...of` or `Promise.all(items.map(async ...))`
- Express error handler: MUST have 4 params `(err, req, res, next)` — even if unused, or Express ignores it
- Unhandled promise rejection crashes Node 15+ — always catch or use `process.on('unhandledRejection')`
- `asyncHandler` wrapper: wrap Express route handlers to catch async errors → `next(err)`
- `req.body` is `undefined` without `express.json()` middleware — common setup miss
- `process.env.PORT` is string — parse with `parseInt()` or `Number()` before comparison
- NestJS: `@Injectable()` with `@Module({ providers: [...] })` — forgetting module registration = runtime error
- Stream backpressure: always handle `drain` event on writable streams for large data
- `__dirname` not available in ESM — use `import.meta.dirname` (Node 21+) or `fileURLToPath(import.meta.url)`
