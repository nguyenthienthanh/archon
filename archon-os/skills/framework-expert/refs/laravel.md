> Framework reference: Laravel. Loaded on demand by the framework-expert bundle.

# Laravel Expert — Gotchas & Decisions

Use Context7 for full Laravel docs.

## Key Decisions

```toon
decisions[4]{choice,use_when}:
  Form Request vs inline,"Form Request for reusable validation. Inline for one-off simple checks"
  Service vs Action class,"Service for stateless business logic. Action (single __invoke) for discrete operations"
  Event/Listener vs direct,"Events for decoupling (notifications/logging). Direct for tightly coupled ops"
  Eloquent vs Query Builder,"Eloquent for domain models with relationships. Query Builder for reports/bulk ops"
```

## Gotchas

- N+1: always `with()` eager load. Use `preventLazyLoading()` in AppServiceProvider to catch in dev
- `readonly` DTOs (PHP 8.2+): `readonly class UserData { public function __construct(public string $name) {} }`
- `updateOrCreate` is NOT atomic — race condition possible. Use DB transaction for critical ops
- `$model->save()` returns bool, not the model — don't chain. `Model::create()` returns the model
- Mass assignment: `$fillable` whitelist or `$guarded = []` (never use `$guarded = []` with user input)
- `firstOrFail()` throws `ModelNotFoundException` (404). `first()` returns null silently
- Queue jobs: always implement `ShouldQueue`. Without it, runs synchronously despite `dispatch()`
- `Carbon::now()` in tests: use `$this->travel()` or `Carbon::setTestNow()` for deterministic tests
- Migrations: never edit a deployed migration. Create new migration for changes
