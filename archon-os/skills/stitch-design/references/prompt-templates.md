# Stitch Prompt Templates

Optimized prompts for Google Stitch AI by design type.

**Usage:** Replace `{placeholders}` with actual values.

---

## Dashboard Template {#dashboard}

```
Create a {theme} dashboard for {app_name} with:

**Layout:**
- Top navigation bar with logo, search, notifications, user avatar
- Left sidebar with collapsible menu items: {menu_items}
- Main content area with {grid_layout}

**Key Sections:**
1. Overview Cards ({card_count} cards in row):
   {card_items}

2. Data Table:
   - Columns: {table_columns}
   - Sortable headers
   - Pagination
   - Row actions (edit, delete)

3. Chart Section:
   - {chart_type} chart for {data_visualization}
   - Timeframe selector: 1D, 1W, 1M, 1Y, ALL
   - Hover tooltips with data

4. Activity Feed:
   - Card-based layout
   - Timestamp, user, action
   - Load more button

**Style:**
- Background: {background_color}
- Cards: {card_color} with subtle border
- Accent: {accent_color}
- Typography: {font_style} (clean/modern/elegant)
- Border radius: {corner_style}px
- Spacing: {density} (compact/comfortable/spacious)

**Responsive:** Desktop-first, tablet-friendly
```

### Example: Crypto Dashboard

```
Create a dark-themed dashboard for CryptoTracker with:

**Layout:**
- Top navigation bar with logo, search, notifications, user avatar
- Left sidebar with collapsible menu items: Dashboard, Portfolio, Markets, News, Settings

**Key Sections:**
1. Overview Cards (4 cards in row):
   - Total Value with 24h change %
   - Best Performer with coin icon
   - Worst Performer with coin icon
   - Total P&L with color indicator

2. Data Table:
   - Columns: Coin (icon + name), Amount, Value, 24h Change, Allocation %
   - Sortable headers
   - Pagination

3. Chart Section:
   - Area chart for portfolio value over time
   - Timeframe selector: 1D, 1W, 1M, 1Y, ALL
   - Hover tooltips

4. Activity Feed:
   - Recent transactions
   - Price alerts

**Style:**
- Background: #0D1117
- Cards: #161B22 with subtle border
- Accent: #58A6FF (blue) for positive, #F85149 (red) for negative
- Typography: Inter, clean and modern
- Border radius: 12px
- Spacing: Comfortable (16px gaps)

**Responsive:** Desktop-first, tablet-friendly
```

---

## Landing Page Template {#landing}

```
Design a landing page for {product_name}:

**Hero Section:**
- Headline: {value_proposition}
- Subheadline: {supporting_text}
- CTA button: {cta_text}
- Hero image/illustration: {visual_style}

**Sections:**
1. Features Grid ({feature_count} items):
   {feature_items}

2. Social Proof:
   - {testimonial_count} testimonials with photo, name, role
   - OR logo cloud with {logo_count} company logos

3. Pricing Table ({tier_count} tiers):
   {pricing_tiers}

4. FAQ Section:
   - Accordion style
   - {faq_count} questions

5. Footer:
   - {footer_columns} columns
   - Newsletter signup
   - Social links

**Style:**
- Theme: {light/dark/gradient}
- Primary color: {primary_color}
- Secondary color: {secondary_color}
- Visual style: {minimal/bold/playful/professional}
- Typography: {font_family}

**Responsive:** Mobile-first
```

### Example: SaaS Landing Page

```
Design a landing page for TaskFlow:

**Hero Section:**
- Headline: "Manage tasks 10x faster with AI"
- Subheadline: "The smart project management tool that learns your workflow"
- CTA button: "Start Free Trial"
- Hero image: Clean dashboard mockup

**Sections:**
1. Features Grid (3 items):
   - AI Task Prioritization
   - Team Collaboration
   - Smart Automation

2. Social Proof:
   - 3 testimonials from CTOs
   - Logo cloud with 6 company logos

3. Pricing Table (3 tiers):
   - Free: $0/month - 5 projects
   - Pro: $12/month - Unlimited projects
   - Enterprise: Custom - SSO + API

4. FAQ Section:
   - Accordion style
   - 5 questions

5. Footer:
   - 4 columns: Product, Resources, Company, Legal
   - Newsletter signup
   - Social links

**Style:**
- Theme: Light with gradient accents
- Primary color: #6366F1 (indigo)
- Secondary color: #EC4899 (pink)
- Visual style: Modern, clean, professional
- Typography: Plus Jakarta Sans

**Responsive:** Mobile-first
```

---

## Mobile App Template {#mobile}

```
Design mobile app screens for {app_name}:

**Platform:** {iOS/Android/Both}

**Screens Needed:**
1. Onboarding ({onboarding_style}):
   - {screen_count} screens
   - {onboarding_elements}

2. Authentication:
   - Login with {auth_methods}
   - Registration flow
   - Forgot password

3. Home Screen:
   - {home_layout}
   - {home_elements}

4. {feature_screen_1}:
   - {feature_1_description}

5. {feature_screen_2}:
   - {feature_2_description}

6. Profile:
   - Avatar, name, stats
   - Settings access
   - {profile_elements}

**Navigation:**
- Type: {bottom_nav/drawer/tabs}
- Items: {nav_items}

**Style:**
- Theme: {light/dark/system}
- Accent color: {accent_color}
- Icons: {icon_style} (outline/filled/duotone)
- Safe areas: Respect notch and home indicator
- Touch targets: 44x44pt minimum

**Responsive:** Phone portrait, consider tablet
```

### Example: Fitness App

```
Design mobile app screens for FitTrack:

**Platform:** iOS

**Screens Needed:**
1. Onboarding (Carousel):
   - 3 screens
   - Track workouts, Set goals, Get insights

2. Authentication:
   - Login with Apple, Google, Email
   - Registration with fitness goals

3. Home Screen:
   - Today's progress ring
   - Quick start workout
   - Activity feed

4. Workout Screen:
   - Exercise list with demos
   - Timer/rep counter
   - Rest periods

5. Progress Screen:
   - Weekly/monthly charts
   - Personal records
   - Achievements

6. Profile:
   - Avatar, name, level
   - Body stats
   - Settings

**Navigation:**
- Type: Bottom nav
- Items: Home, Workouts, Progress, Profile

**Style:**
- Theme: Dark
- Accent color: #10B981 (green)
- Icons: SF Symbols style
- Safe areas: Respect notch and home indicator

**Responsive:** iPhone 14/15 size
```

---

## E-commerce Template {#ecommerce}

```
Design e-commerce screens for {store_name}:

**Product Category:** {category}

**Screens Needed:**
1. Product Listing:
   - Grid/List toggle
   - Filters: {filter_options}
   - Sort: {sort_options}
   - {products_per_page} products per page

2. Product Detail:
   - Image gallery with zoom
   - Price, variants, quantity
   - Add to cart button
   - Reviews section
   - Related products

3. Shopping Cart:
   - Item list with quantity controls
   - Price breakdown
   - Promo code input
   - Checkout button

4. Checkout Flow:
   - Shipping address
   - Payment method
   - Order review
   - Confirmation

**Style:**
- Theme: {light/dark}
- Brand colors: {brand_colors}
- Product image ratio: {aspect_ratio}
- Typography: {font_family}
- CTA style: {button_style}

**Platform:** {web/mobile/both}
```

### Example: Fashion E-commerce

```
Design e-commerce screens for StyleHouse:

**Product Category:** Women's fashion

**Screens Needed:**
1. Product Listing:
   - Grid/List toggle
   - Filters: Size, Color, Price, Brand
   - Sort: Price, Newest, Popular
   - 12 products per page

2. Product Detail:
   - Image gallery with zoom (5 images)
   - Price, size selector, color swatches
   - Add to cart + wishlist
   - Size guide
   - Reviews (4.5 stars avg)
   - "Complete the look" section

3. Shopping Cart:
   - Item cards with remove/save for later
   - Quantity selector
   - Subtotal, shipping, total
   - Promo code
   - Express checkout (Apple Pay, PayPal)

4. Checkout Flow:
   - Guest checkout option
   - Address autocomplete
   - Card payment + alternatives
   - Order summary sidebar

**Style:**
- Theme: Light, minimal
- Brand colors: Black, white, gold accents
- Product image ratio: 3:4 portrait
- Typography: Playfair Display headings, Inter body
- CTA style: Black buttons, gold hover

**Platform:** Mobile web
```

---

## Forms & Wizards Template {#forms}

```
Design a multi-step form for {form_purpose}:

**Steps:**
1. {step_1_name}:
   - Fields: {step_1_fields}
   - Validation: {step_1_validation}

2. {step_2_name}:
   - Fields: {step_2_fields}
   - Validation: {step_2_validation}

3. {step_3_name}:
   - Fields: {step_3_fields}
   - Validation: {step_3_validation}

4. Review & Submit:
   - Summary of all inputs
   - Edit links per section
   - Terms acceptance
   - Submit button

5. Confirmation:
   - Success message
   - Next steps
   - CTA

**Form Elements:**
- Progress indicator: {stepper/progress bar/breadcrumb}
- Field style: {outlined/filled/underline}
- Error display: {inline/toast/summary}
- Help text: {tooltip/inline}

**Style:**
- Theme: {light/dark}
- Primary color: {primary_color}
- Field spacing: {compact/normal/spacious}
- Border radius: {radius}px

**Platform:** {web/mobile}
```

### Example: Loan Application

```
Design a multi-step form for Personal Loan Application:

**Steps:**
1. Personal Info:
   - Full name, DOB, SSN (masked)
   - Phone, Email
   - Validation: Real-time format check

2. Employment:
   - Employer name, position
   - Monthly income, years employed
   - Validation: Income format, required fields

3. Loan Details:
   - Loan amount slider ($1k-$50k)
   - Loan purpose dropdown
   - Preferred term (12/24/36/48 months)
   - Monthly payment preview

4. Review & Submit:
   - Summary cards per section
   - Edit links
   - Terms checkbox
   - Submit application button

5. Confirmation:
   - Application ID
   - Next steps (verification call)
   - Document upload CTA

**Form Elements:**
- Progress indicator: Numbered stepper with labels
- Field style: Outlined with floating labels
- Error display: Inline below field
- Help text: Tooltip icons

**Style:**
- Theme: Light, professional
- Primary color: #2563EB (blue)
- Field spacing: Normal (16px)
- Border radius: 8px

**Platform:** Web (desktop + mobile responsive)
```

---

## Tips for Better Results

1. **Be specific** - Generic prompts = generic designs
2. **Include metrics** - Card counts, column numbers, etc.
3. **Specify colors** - Use hex codes, not just "blue"
4. **Mention fonts** - Suggest specific font families
5. **Define spacing** - Compact, comfortable, spacious
6. **Add context** - Target audience, brand personality
7. **Request variants** - "Generate 3 layout options"

---

