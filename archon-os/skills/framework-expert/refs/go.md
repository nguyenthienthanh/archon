> Framework reference: Go. Loaded on demand by the framework-expert bundle.

# Go Expert — Gotchas & Decisions

Use Context7 for Go framework docs.

## Key Decisions

```toon
decisions[4]{choice,use_when}:
  Gin vs Echo vs Fiber,"Gin: most popular/stable. Echo: cleaner API. Fiber: highest perf (Express-like)"
  Interface location,"Define in CONSUMER package not provider. Accept interfaces return structs"
  Channel vs Mutex,"Channel for communication between goroutines. Mutex for protecting shared memory"
  Table-driven vs subtests,"Table-driven for input variations. Subtests (t.Run) for distinct scenarios"
```

## Gotchas

- `err != nil` check EVERY error return — never ignore with `_`
- `%w` for wrapping errors (unwrappable), `%v` for formatting only (not unwrappable)
- Goroutine leak: always ensure goroutines can exit (context cancellation, done channels)
- `defer` evaluates args immediately but executes LIFO — `defer f.Close()` captures current `f`
- Range loop variable reuse (pre-Go 1.22): `for _, v := range items { go func() { use(v) }() }` captures same `v`. Fixed in Go 1.22+
- `nil` slice vs empty slice: `var s []int` (nil, marshals to `null`) vs `s := []int{}` (empty, marshals to `[]`)
- `context.Background()` for top-level, `context.TODO()` as placeholder. Always pass context as first param
- Race conditions: use `-race` flag in tests. `go test -race ./...`
- `sync.WaitGroup`: `Add()` before goroutine launch, not inside it
