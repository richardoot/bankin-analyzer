# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Project Overview

Bankin Analyzer is a Vue 3 financial analysis application that processes CSV files from Bankin bank
exports. It provides interactive dashboards with charts, person management, reimbursement tracking,
and PDF exports. The application runs entirely in the browser with no server-side components.

## Development Commands

### Essential Commands

```bash
# Development server
npm run dev                    # Start development server at http://localhost:5173

# Production build
npm run build                  # Build for production (includes TypeScript compilation)
npm run preview               # Preview production build

# Code quality (run before committing)
npm run check-all             # Full validation: type-check + lint + format + test
npm run fix-all              # Auto-fix: format + lint

# Testing
npm run test                  # Run all tests
npm run test:watch           # Watch mode for tests
npm run test:coverage        # Generate coverage report
npm run test:unit            # Run unit tests only
npm run test:components      # Run component tests only
npm run test:integration     # Run integration tests only

# Individual quality checks
npm run type-check           # TypeScript type checking
npm run lint                 # ESLint check
npm run lint:check          # ESLint check only (no fixing)
npm run format              # Prettier formatting
npm run format:check        # Prettier check only
```

### Git and Deployment

```bash
npm run commit               # Interactive commit with conventional commits
npm run hooks:test          # Test git hooks
npm run release:patch       # Version bump and tag
```

## Architecture

### Project Structure

```
src/
├── components/              # Vue components organized by feature
│   ├── charts/             # BarChart.vue, PieChart.vue
│   ├── filters/            # Account, category, and date filters
│   ├── layout/             # Header, footer, hero sections
│   ├── reimbursement/      # Reimbursement management components
│   └── shared/             # Shared components (FileUpload, PersonsManager)
├── composables/            # Reusable business logic
│   ├── useFileUpload.ts    # CSV file processing
│   ├── usePdfExport.ts     # PDF generation
│   └── useBarChart.ts      # Chart data management
├── types/                  # TypeScript type definitions
├── views/                  # Main page components
└── test/                   # Test utilities and setup
```

### Key Technologies

- **Vue 3** with Composition API and `<script setup>`
- **TypeScript** with strict configuration
- **Vite** for build tooling
- **Vitest** for testing
- **Chart rendering** with custom implementations
- **PDF export** using jsPDF and html2canvas
- **No external UI library** - custom CSS with CSS variables

### Data Flow

1. **CSV Import**: Files processed by `useFileUpload.ts` composable
2. **Data Storage**: LocalStorage for persistence (keys: `bankin-analyzer-*`)
3. **State Management**: Reactive refs and computed properties (no Vuex/Pinia)
4. **Components**: Communicate via props/emits and localStorage events

## Code Conventions & Modern Best Practices (2025)

### Vue 3 Composition API Standards

- **Always use `<script setup lang="ts">`** - Default standard for new components in 2025
- **Composables over mixins** - Extract reusable logic into composables following `use*` naming
- **Template refs with explicit types**: `const el = ref<HTMLElement | null>(null)`
- **Event handlers with proper typing** - Explicitly annotate event parameters to avoid `any`
- **Lifecycle hooks in composables** - Use `withSetup` utility for testing lifecycle-dependent
  composables
- **defineComponent() wrapper** - Wrap components for better TypeScript inference when needed

### TypeScript Strict Mode (2025)

- **Strict mode mandatory** - `"strict": true` with all sub-options enabled
- **Interface-based type definitions** in `/src/types/index.ts`
- **Avoid `any` type** - Prefer `unknown` over `any` for stricter type checks
- **Template type checking** - Enable `strictTemplates` for Vue template validation
- **Runtime validation integration** - Complement TypeScript with runtime validation (zod/io-ts)
- **Explicit generic types** - Always provide explicit types for template refs and reactive values

### Modern CSS Architecture

- **CSS Custom Properties organization** - Centralize CSS variables in dedicated files/modules
- **Scoped CSS with design tokens** - Use CSS variables for consistent theming
- **Performance-first animations** - Animate only `transform` and `opacity` properties
- **CSS containment** - Use `content-visibility: auto` for off-screen content optimization
- **Modular CSS loading** - Split CSS by functionality, load only necessary styles per route

### Vitest Testing Standards (2025)

- **Component isolation** - Test components in isolation with proper mocks
- **Composables testing** - Use `withSetup` utility for lifecycle-dependent composables testing
- **TypeScript in tests** - Full TypeScript support with proper type inference
- **Mock Service Worker** - Use MSW for API mocking instead of manual mocks
- **Coverage thresholds** - Maintain 80% lines, 70% branches/functions minimum
- **Happy-dom environment** - Faster alternative to jsdom for Vue component testing

### Performance Optimization (2025)

- **Vite build optimization** - Use `build.target: 'esnext'` for modern browsers
- **Dynamic imports** - Code splitting with `import()` for route-based chunks
- **Tree shaking** - Import only specific functions, never entire libraries
- **Bundle analysis** - Regular bundle visualization with rollup-plugin-visualizer
- **Lazy loading patterns** - Implement lazy loading for heavy components and routes

### Security Practices (2025)

- **localStorage for non-sensitive data only** - User preferences, UI settings, theme choices
- **Input validation** - Always validate and sanitize data before localStorage
- **XSS prevention** - Never store sensitive information in localStorage
- **Data encryption** - Consider encryption for sensitive store persistence
- **CSP compliance** - Ensure all code is Content Security Policy compatible

### Git Workflow

- Conventional Commits enforced by commitlint
- Husky hooks for pre-commit validation
- Automated type checking, linting, and formatting
- Commit message format: `type(scope): description`

## Important Implementation Details

### CSV Processing

The application specifically handles Bankin bank CSV exports with:

- Semicolon-separated values
- Expected headers: Date, Description, Compte, Montant, Catégorie, Sous-Catégorie, Note, Pointée
- Expense/income categorization based on amount sign
- Support for multi-line descriptions with proper quote handling

### Chart Implementation

- Custom chart components (no external chart library)
- BarChart for monthly expense/income trends
- PieChart for category distribution with month filtering
- Responsive design with tooltips and hover effects

### PDF Export

- Multi-page PDF generation with French formatting
- Automatic pagination with anti-break CSS properties
- Transaction details with proper date formatting (DD/MM/YYYY)
- Integration with chart screenshots via html2canvas

### Data Persistence

- localStorage keys follow pattern: `bankin-analyzer-{feature}`
- Automatic cleanup of orphaned data relationships
- Real-time synchronization between components via localStorage events

## Testing Strategy

### Manual Testing Approach

The project uses comprehensive manual testing procedures documented in `/docs/TESTING_GUIDE.md`. Key
test scenarios:

1. **CSV Upload**: Test with provided files in `/docs/test-data/`
2. **Person Management**: CRUD operations with email validation
3. **Chart Interactions**: Tooltips, filtering, responsiveness
4. **PDF Export**: Multi-page generation with French formatting
5. **Data Persistence**: LocalStorage synchronization

### Test Data Files

- `bankin-demo.csv` - Basic test data
- `bankin-demo-multi-mois.csv` - Multi-month data
- `bankin-french-dates.csv` - French date format testing

## Common Development Tasks

### Adding New Features

1. Define TypeScript interfaces in `/src/types/`
2. Create composable in `/src/composables/` for business logic
3. Build Vue component with proper props/emits
4. Add appropriate tests and update documentation

### Debugging CSV Issues

- Check `useFileUpload.ts` for CSV parsing logic
- Verify expected headers match Bankin format
- Test with provided sample files in `/docs/test-data/`

### Chart Modifications

- Chart components are custom implementations
- Update chart logic in respective composables
- Test responsiveness and tooltip positioning

### Performance Optimization

- Application handles 1000+ transactions efficiently
- Use computed properties for derived data
- Implement lazy loading where appropriate
- Monitor bundle size with Vite build analysis

## Modern Development Practices (2025)

### Vite Build Configuration

- **Target modern browsers** - Set `build.target: 'esnext'` for optimal performance
- **Disable sourcemaps in production** - Remove sourcemaps for faster builds
- **Manual chunking strategy** - Isolate third-party libraries for better caching
- **Bundle size monitoring** - Regular analysis with rollup-plugin-visualizer
- **Image optimization** - Use vite-plugin-imagemin for automatic image compression

### Vue 3 Component Architecture

- **Single File Components** - Always use `<script setup lang="ts">` syntax
- **Composable patterns** - Extract business logic into reusable composables
- **Props validation** - Use TypeScript interfaces for comprehensive prop validation
- **Emit typing** - Define explicit emit interfaces for better component communication
- **Template type safety** - Enable strict template checking for runtime error prevention

### State Management Patterns

- **Reactive primitives** - Use `ref()` and `reactive()` over complex state libraries
- **Computed optimization** - Leverage computed properties for derived state
- **Local storage patterns** - Implement proper error handling and data validation
- **Event-driven updates** - Use localStorage events for cross-component synchronization
- **Memory leak prevention** - Proper cleanup of event listeners and watchers

### Testing Excellence

- **Test-driven development** - Write tests before implementation when possible
- **Component testing isolation** - Mock external dependencies properly
- **Integration test coverage** - Focus on user workflows and data flow
- **Performance testing** - Monitor rendering performance with large datasets
- **Accessibility testing** - Ensure components meet WCAG guidelines

## Security Considerations

- **No server communication**: All processing happens locally
- **No sensitive data transmission**: CSV files processed in browser only
- **Input validation**: Strict file type and size validation
- **CSP-ready**: Compatible with Content Security Policy

## Known Limitations

- Only supports Bankin CSV format (not other bank formats)
- French locale specific (dates, number formatting)
- No real-time collaboration features
- Desktop-first design (mobile responsive but not optimized)
