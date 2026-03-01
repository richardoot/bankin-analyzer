# PNPM Package Manager Standards

These standards outline best practices for using pnpm as your package manager in Node.js projects. They emphasize performance, disk space efficiency, security, and proper dependency management for modern development workflows.

## Installation and Setup

**Install pnpm globally using the official installer.**  
Use the official pnpm installation method for the most stable and up-to-date version.  

*Why?* The official installer ensures you get the latest version with proper system integration and auto-updates.

**Example:**
```bash
# Install pnpm globally
curl -fsSL https://get.pnpm.io/install.sh | sh -

# Or using npm (if Node.js is already installed)
npm install -g pnpm

# Verify installation
pnpm --version
```

**Configure Node.js version management.**  
Set up Node.js version management with pnpm's built-in environment management.  

*Why?* Ensures consistent Node.js versions across team members and environments.

**Example:**
```bash
# Set Node.js version for the project
pnpm env use --global 20.11.0

# Install and use specific Node version
pnpm env use 20.11.0

# Check current Node version
pnpm env list
```

## Project Configuration

**Initialize projects with proper pnpm configuration.**  
Configure pnpm settings through `.npmrc` and `package.json` for optimal performance and security.  

*Why?* Proper configuration ensures fast installs, security, and consistent behavior across environments.

**Example:**
```bash
# Initialize new project
pnpm init

# Create .npmrc with recommended settings
echo "shamefully-hoist=false
strict-peer-dependencies=false
auto-install-peers=true
prefer-frozen-lockfile=true
resolution-mode=highest" > .npmrc
```

**Configure workspace for monorepos.**  
Set up pnpm workspaces for multi-package projects with proper dependency management.  

*Why?* Workspaces enable efficient dependency sharing and reduce duplication in monorepo setups.

**Example:**
```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'libs/*'
```

```json
// package.json (root)
{
  "name": "my-workspace",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "dev": "pnpm -r --parallel dev"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.0.0"
  }
}
```

## Dependency Management Best Practices

**Use exact versioning for critical dependencies.**  
Pin exact versions for core dependencies and allow ranges for development tools.  

*Why?* Prevents unexpected breaking changes while maintaining flexibility for non-critical dependencies.

**Example:**
```json
{
  "dependencies": {
    "express": "4.18.2",
    "prisma": "7.0.1",
    "@prisma/client": "7.0.1"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.0.0",
    "eslint": "~9.0.0"
  }
}
```

**Separate dependencies by usage type.**  
Organize dependencies into appropriate categories for better project management.  

*Why?* Improves bundle optimization and makes dependency management more explicit.

**Example:**
```bash
# Production dependencies
pnpm add express prisma @prisma/client

# Development dependencies
pnpm add -D typescript @types/node vitest

# Peer dependencies (for library projects)
pnpm add -P react react-dom

# Optional dependencies
pnpm add -O sharp
```

**Use dependency overrides for security and compatibility.**  
Override transitive dependencies to fix security vulnerabilities or compatibility issues.  

*Why?* Ensures security patches are applied even when dependencies haven't been updated by maintainers.

**Example:**
```json
// package.json
{
  "pnpm": {
    "overrides": {
      "semver@<7.5.4": ">=7.5.4",
      "axios": "1.6.0",
      "lodash": "npm:lodash-es@latest"
    },
    "peerDependencyRules": {
      "ignoreMissing": ["react", "react-dom"],
      "allowedVersions": {
        "react": "18"
      }
    }
  }
}
```

## Performance Optimization

**Leverage pnpm's content-addressable store.**  
Understand and optimize pnpm's storage mechanism for maximum efficiency.  

*Why?* Reduces disk usage by 50-90% compared to npm/yarn and significantly speeds up installations.

**Example:**
```bash
# Check store location and size
pnpm store path
pnpm store status

# Prune unused packages from store
pnpm store prune

# Configure custom store location
echo "store-dir=/custom/path/to/store" >> ~/.npmrc
```

**Use selective dependency installation.**  
Install only production dependencies in production environments.  

*Why?* Reduces container size and attack surface in production deployments.

**Example:**
```bash
# Install only production dependencies
pnpm install --prod

# Install with frozen lockfile (CI/CD)
pnpm install --frozen-lockfile

# Install with specific environment
pnpm install --prod --frozen-lockfile
```

**Optimize installation with fetch configuration.**  
Configure concurrent downloads and registry settings for faster installs.  

*Why?* Maximizes download speed and reduces installation time in CI/CD pipelines.

**Example:**
```bash
# Configure in .npmrc
echo "network-concurrency=16
fetch-retries=5
fetch-retry-factor=10
fetch-retry-mintimeout=10000
fetch-retry-maxtimeout=60000" >> .npmrc
```

## Security Best Practices

**Enable audit and vulnerability scanning.**  
Regularly scan dependencies for security vulnerabilities and fix them promptly.  

*Why?* Prevents security breaches from vulnerable dependencies in your supply chain.

**Example:**
```bash
# Run security audit
pnpm audit

# Fix vulnerabilities automatically
pnpm audit --fix

# Generate audit report
pnpm audit --json > audit-report.json

# Configure audit in package.json scripts
{
  "scripts": {
    "security:audit": "pnpm audit",
    "security:fix": "pnpm audit --fix",
    "precommit": "pnpm security:audit"
  }
}
```

**Use trusted registries and verify packages.**  
Configure trusted registries and enable package verification for enhanced security.  

*Why?* Protects against malicious packages and ensures dependencies come from trusted sources.

**Example:**
```bash
# Configure trusted registries in .npmrc
registry=https://registry.npmjs.org/
@company:registry=https://npm.company.com/

# Enable package verification
package-lock=true
package-lock-only=true

# Configure scope-specific registries
@babel:registry=https://registry.npmjs.org/
@types:registry=https://registry.npmjs.org/
```

**Implement dependency policies.**  
Set up policies for dependency approval and review processes.  

*Why?* Ensures all dependencies meet security and quality standards before being added to the project.

**Example:**
```json
// package.json
{
  "scripts": {
    "deps:check": "pnpm outdated",
    "deps:update": "pnpm update --interactive",
    "deps:add": "node scripts/verify-dependency.js && pnpm add"
  },
  "pnpm": {
    "allowedDeprecatedVersions": {
      "node-sass": "*"
    },
    "neverBuiltDependencies": ["node-sass", "sharp"]
  }
}
```

## Workspace Management

**Structure workspaces logically.**  
Organize workspace packages by functionality and maintain clear boundaries.  

*Why?* Improves maintainability and enables better team collaboration in large projects.

**Example:**
```
project/
├── pnpm-workspace.yaml
├── package.json
├── apps/
│   ├── web/              # Next.js frontend
│   ├── api/              # Express.js backend
│   └── mobile/           # React Native app
├── packages/
│   ├── ui/               # Shared UI components
│   ├── utils/            # Utility functions
│   └── config/           # Shared configurations
└── libs/
    ├── database/         # Database schemas
    └── types/            # TypeScript types
```

**Configure workspace dependencies correctly.**  
Use workspace protocol for internal dependencies and manage external ones efficiently.  

*Why?* Ensures proper linking between workspace packages and enables local development.

**Example:**
```json
// apps/web/package.json
{
  "name": "@myproject/web",
  "dependencies": {
    "@myproject/ui": "workspace:*",
    "@myproject/utils": "workspace:^",
    "@myproject/types": "workspace:~",
    "react": "^18.2.0"
  }
}

// packages/ui/package.json
{
  "name": "@myproject/ui",
  "peerDependencies": {
    "react": ">=18.0.0"
  },
  "dependencies": {
    "@myproject/utils": "workspace:*"
  }
}
```

**Implement cross-workspace scripts.**  
Set up scripts that work across all workspace packages for common tasks.  

*Why?* Standardizes development workflows and enables efficient project-wide operations.

**Example:**
```json
// Root package.json
{
  "scripts": {
    "build": "pnpm -r build",
    "build:web": "pnpm --filter @myproject/web build",
    "test": "pnpm -r --parallel test",
    "test:changed": "pnpm -r --filter=[HEAD~1] test",
    "lint": "pnpm -r lint",
    "lint:fix": "pnpm -r lint:fix",
    "dev": "pnpm -r --parallel --filter=!@myproject/mobile dev",
    "clean": "pnpm -r exec rm -rf dist node_modules/.cache",
    "deps:update": "pnpm -r update --interactive --latest"
  }
}
```

## CI/CD Integration

**Configure pnpm for continuous integration.**  
Optimize pnpm installation and caching for CI/CD pipelines.  

*Why?* Reduces build times and ensures consistent, reproducible builds in automated environments.

**Example:**
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
          
      - name: Get pnpm store directory
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV
          
      - name: Setup pnpm cache
        uses: actions/cache@v3
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-
            
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        
      - name: Run tests
        run: pnpm test
        
      - name: Build
        run: pnpm build
```

**Implement proper caching strategies.**  
Configure caching for different CI/CD providers to maximize build speed.  

*Why?* Dramatically reduces CI/CD build times by reusing previously installed dependencies.

**Example:**
```yaml
# GitLab CI (.gitlab-ci.yml)
variables:
  PNPM_CACHE_FOLDER: .pnpm
  
cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - .pnpm/
    - node_modules/
    
before_script:
  - curl -fsSL https://get.pnpm.io/install.sh | sh -
  - pnpm config set store-dir .pnpm
  - pnpm install --frozen-lockfile

# Docker optimization
# Dockerfile
FROM node:20-alpine

# Install pnpm
RUN corepack enable

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy source code
COPY . .

RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
```

## Troubleshooting and Maintenance

**Monitor and maintain the pnpm store.**  
Regularly clean and optimize the pnpm store for optimal performance.  

*Why?* Prevents store bloat and ensures optimal installation performance over time.

**Example:**
```bash
# Check store status and size
pnpm store status

# Remove unreferenced packages
pnpm store prune

# Verify store integrity
pnpm store verify

# Create maintenance script
# scripts/maintain-pnpm.sh
#!/bin/bash
echo "Checking pnpm store status..."
pnpm store status

echo "Pruning unused packages..."
pnpm store prune

echo "Verifying store integrity..."
pnpm store verify

echo "Maintenance complete!"
```

**Debug installation and resolution issues.**  
Use pnpm's debugging tools to diagnose and resolve dependency problems.  

*Why?* Enables quick resolution of complex dependency conflicts and installation failures.

**Example:**
```bash
# Debug dependency resolution
pnpm why package-name

# Show dependency tree
pnpm list --depth=2

# Debug installation issues
pnpm install --reporter=append-only --loglevel=debug

# Check for peer dependency issues
pnpm install --reporter=default --loglevel=warn

# Resolve specific package issues
pnpm rebuild package-name
pnpm update package-name --latest
```

**Handle common issues and error resolution.**  
Document solutions for frequent pnpm-related problems and their resolutions.  

*Why?* Reduces debugging time and provides team members with quick solutions to common issues.

**Example:**
```bash
# Common issue fixes

# 1. Peer dependency warnings
echo "auto-install-peers=true" >> .npmrc

# 2. Hoisting issues
echo "shamefully-hoist=false" >> .npmrc
echo "hoist-pattern[]=*eslint*" >> .npmrc

# 3. Node.js version mismatch
pnpm env use --global 20.11.0

# 4. Store corruption
pnpm store verify
pnpm store prune

# 5. Lockfile conflicts
rm pnpm-lock.yaml
pnpm install

# 6. Workspace linking issues
pnpm install -r
pnpm rebuild -r
```

These standards ensure you're using pnpm effectively for fast, secure, and efficient package management in modern Node.js projects.