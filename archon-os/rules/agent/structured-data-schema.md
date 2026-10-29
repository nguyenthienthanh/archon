> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Structured Data & Schema.org Rules

**Category:** Quality
**Priority:** High
**Purpose:** Implement Schema.org structured data for rich search results and AI discovery

---

## Core Principles

1. **Use JSON-LD format** (Google recommended) in `<head>` or end of `<body>`
2. **All structured data MUST pass Rich Results Test before deployment**
3. Multiple schemas per page allowed via JSON array

---

## Required Schemas by Page Type

```toon
schemas[8]{page_type,schema_type,required_fields}:
  Homepage,WebSite,"name, url, potentialAction (SearchAction)"
  Organization,Organization,"name, url, logo, sameAs[], contactPoint"
  Article/Blog,Article,"headline (max 110), author, publisher, datePublished, dateModified, image[]"
  E-commerce,Product,"name, image, sku, brand, offers (price/currency/availability), aggregateRating"
  FAQ,FAQPage,"mainEntity[] with Question + acceptedAnswer"
  Local Business,LocalBusiness,"name, address, geo, telephone, openingHoursSpecification"
  Breadcrumb,BreadcrumbList,"itemListElement[] with position + name + item"
  Tutorial,HowTo,"name, description, totalTime, step[]"
```

---

## Next.js Implementation

```typescript
// components/JsonLd.tsx
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

// Usage in page
const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": post.title,
  "author": { "@type": "Person", "name": post.author },
  "datePublished": post.publishedAt,
  "dateModified": post.updatedAt,
};
<JsonLd data={articleSchema} />
```

---

## Validation

```toon
validation_workflow[5]{step,action,url}:
  1,Test structured data,https://search.google.com/test/rich-results
  2,Validate JSON-LD syntax,https://validator.schema.org
  3,Check mobile rendering,https://search.google.com/test/mobile-friendly
  4,Audit performance,https://pagespeed.web.dev
  5,Monitor in production,Google Search Console
```

```toon
common_errors[5]{error,fix}:
  Missing required fields,Check schema.org for required properties
  Invalid date format,Use ISO 8601: 2025-01-15T08:00:00+00:00
  Missing @context,Always include "https://schema.org"
  Wrong @type,Use exact schema.org type names
  Broken image URLs,Use absolute URLs with https
```

---

**Related Skills:** `seo-expert`, `ai-discovery-expert`
