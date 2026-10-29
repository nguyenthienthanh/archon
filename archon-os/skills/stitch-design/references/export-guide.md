# Stitch Export Guide

How to export designs from Google Stitch for development.

---

## Export Options

| Method | Best For | Output |
|--------|----------|--------|
| **Paste to Figma** | Design iteration, handoff | Figma layers with proper structure |
| **Export Code** | Direct implementation | Clean HTML/CSS |

---

## Option 1: Figma Export (Recommended)

### When to Use
- Need further design refinement
- Team uses Figma for design system
- Want to generate multiple variants
- Need design specs for developers

### Steps

1. **In Stitch:**
   - Select your preferred design variant
   - Click **"Paste to Figma"** button

2. **In Figma:**
   - Open your target Figma file
   - Create a new frame/page for Stitch designs
   - Press `Cmd/Ctrl + V` to paste
   - Designs appear as editable layers

3. **Organize in Figma:**
   - Rename layers to match component names
   - Group related elements
   - Extract reusable components
   - Add to design system if applicable

### Tips
- Stitch preserves layer structure - use it!
- Check that fonts are available in Figma
- Convert repeated elements to components
- Add auto-layout for responsive behavior

---

## Option 2: Code Export

### When to Use
- Quick prototype to code
- Simple static pages
- Starting point for React/Vue/etc.
- Learning/reference

### Steps

1. **In Stitch:**
   - Select your preferred design variant
   - Click **"Export Code"** button
   - Choose export format (HTML/CSS)

2. **Copy the Code:**
   - Click "Copy HTML" and "Copy CSS"
   - Or download as files

3. **Integration:**
   - Create new component file in your project
   - Paste HTML structure
   - Adapt to your framework (React JSX, Vue template, etc.)
   - Move CSS to your styling approach

### Code Adaptation Guide

```toon
framework_mapping[5]{from_stitch,to_framework,changes}:
  div.container,<Container>,Use component library
  class="btn",className="btn",React JSX syntax
  style="...",sx={{...}},MUI/Chakra style props
  inline CSS,Tailwind classes,Map to utility classes
  <img src>,<Image src>,Next.js Image component
```

### Example: HTML to React

**Stitch Output:**
```html
<div class="card">
  <img src="image.jpg" alt="Product" class="card-image">
  <h3 class="card-title">Product Name</h3>
  <p class="card-price">$99.00</p>
  <button class="btn-primary">Add to Cart</button>
</div>
```

**React Component:**
```tsx
export function ProductCard({ name, price, image }: ProductCardProps) {
  return (
    <div className="card">
      <img src={image} alt={name} className="card-image" />
      <h3 className="card-title">{name}</h3>
      <p className="card-price">${price.toFixed(2)}</p>
      <button className="btn-primary">Add to Cart</button>
    </div>
  );
}
```

---

## Post-Export Checklist

### For Figma Export
- [ ] Layers are properly named
- [ ] Components are extracted
- [ ] Colors use design tokens
- [ ] Typography uses text styles
- [ ] Responsive variants created

### For Code Export
- [ ] HTML adapted to framework syntax
- [ ] CSS moved to project's styling approach
- [ ] Images optimized and moved to assets
- [ ] Fonts loaded properly
- [ ] Responsive CSS verified
- [ ] Accessibility attributes added

---

## Common Issues

### Figma Paste Not Working
1. Make sure Figma app is focused
2. Try pasting into an empty frame
3. Check clipboard permissions
4. Refresh Stitch and try again

### Code Looks Different in Browser
1. Check font availability
2. Verify CSS is loading
3. Check for missing images
4. Inspect responsive breakpoints

### Colors Don't Match
1. Use color picker to get exact values
2. Map to design system tokens
3. Check color space (sRGB vs Display P3)

---

## Integration with Design Systems

### Material UI (MUI)

```tsx
// Map Stitch colors to MUI theme
const theme = createTheme({
  palette: {
    primary: { main: '#6366F1' }, // From Stitch
    secondary: { main: '#EC4899' },
  },
});

// Use MUI components instead of raw HTML
<Button variant="contained">Add to Cart</Button>
```

### Tailwind CSS

```tsx
// Map Stitch styles to Tailwind classes
// Stitch: padding: 16px → Tailwind: p-4
// Stitch: border-radius: 12px → Tailwind: rounded-xl
// Stitch: #6366F1 → Tailwind: indigo-500

<div className="p-4 rounded-xl bg-indigo-500">
  Content
</div>
```

### shadcn/ui

```tsx
// Use shadcn components with Stitch styling
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

// Apply Stitch colors via CSS variables
// Update globals.css with Stitch color values
```

---

## Sharing with Claude

After exporting, share with Claude by:

1. **For Figma:** Share the Figma link
   ```
   Here's the Stitch design in Figma: [link]
   ```

2. **For Code:** Paste the HTML/CSS
   ```
   Here's the exported code from Stitch:

   HTML:
   [paste HTML]

   CSS:
   [paste CSS]
   ```

3. **Request integration:**
   ```
   Please integrate this into my [React/Vue/etc.] project
   following the project conventions.
   ```

---

