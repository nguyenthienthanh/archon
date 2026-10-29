> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Direct Hook Access - No Intermediate Destructuring

**Priority:** High
**Applies To:** Theme hooks, translation hooks, shared utilities

---

## Core Principle

**Access values directly from hook objects. Don't destructure and pass around.**

---

## Quick Reference

```toon
patterns[2]{type,example}:
  Bad,"const { t } = useTranslation(); return { t };"
  Good,"const logic = useLogic(); logic.t('key')"
```

---

## What NOT to Do

### Destructuring and Returning

```typescript
// ❌ BAD - Destructuring hook values
const useLogic = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return { t, colors }; // ❌ Hard to track origin
};

const Component = () => {
  const { t, colors } = useLogic();
  return <Text style={{ color: colors.primary }}>{t('hello')}</Text>;
};
```

### Prop Drilling Hook Values

```typescript
// ❌ BAD - Passing hook values as props
const Parent = () => {
  const { t } = useTranslation();
  return <Child t={t} />;
};
```

---

## What TO Do

### Keep Hook Objects Intact

```typescript
// ✅ GOOD - Return entire hook objects
const useLogic = () => {
  const translation = useTranslation();
  const theme = useTheme();

  const handleSave = async () => { /* ... */ };

  return {
    translation,  // Entire hook object
    theme,        // Entire hook object
    handleSave,   // Your logic
  };
};
```

### Access via Namespace

```typescript
// ✅ GOOD - Clear data source
const Component = () => {
  const logic = useLogic();

  return (
    <View style={{ backgroundColor: logic.theme.colors.primary }}>
      <Text>{logic.translation.t('hello')}</Text>
      <Button onPress={logic.handleSave} />
    </View>
  );
};
```

### Direct Hook Access in Components

```typescript
// ✅ GOOD - Get hooks where needed
const Child = () => {
  const translation = useTranslation();
  const theme = useTheme();

  return (
    <Text style={{ color: theme.colors.text }}>
      {translation.t('title')}
    </Text>
  );
};
```

---

## Benefits

```toon
benefits[4]{aspect,improvement}:
  Traceability,"logic.t('key') - clear origin"
  Refactoring,"Search 'logic.handleSave' - exact matches"
  IntelliSense,"Type 'logic.' - see all properties"
  Consistency,"Same pattern everywhere"
```

---

## Code Review Checklist

- [ ] Hooks return entire objects (not destructured)
- [ ] Values accessed via namespace (logic.x)
- [ ] No prop drilling of hook values
- [ ] Consistent pattern throughout component
- [ ] Easy to track data source

---

