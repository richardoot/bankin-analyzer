# npm & Package Management Standards

## Security & Supply Chain Protection

**Use exact dependency pinning for critical packages.**  
Pin exact versions for security-critical dependencies to prevent supply chain attacks.  

*Why?* Prevents automatic updates to compromised packages, especially important after recent npm security incidents in 2024-2025.

**Example:**
```json
{
  "dependencies": {
    "react": "18.2.0",
    "express": "4.18.2"
  }
}
```

**Always commit package-lock.json.**  
Include package-lock.json in version control for reproducible builds.  

*Why?* Ensures consistent dependency resolution across environments and team members.

**Audit dependencies regularly.**  
Run `npm audit` frequently and use automated tools like Snyk or Dependabot.  

*Why?* Identifies known vulnerabilities and provides update recommendations.

**Example:**
```bash
npm audit
npm audit fix
npx snyk test
```

## Modern Package.json Configuration

**Use type: "module" for new projects.**  
Enable ES modules by default in package.json.  

*Why?* ES modules are the standard in 2025, enabling better tree-shaking and static analysis.

**Example:**
```json
{
  "type": "module",
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  }
}
```

**Define strict engine requirements.**  
Specify minimum Node.js and npm versions to ensure compatibility.  

*Why?* Prevents runtime issues and enables use of modern JavaScript features.

## Performance Optimization

**Use npm ci in production builds.**  
Replace `npm install` with `npm ci` for CI/CD environments.  

*Why?* 40% faster installs and guarantees clean, reproducible builds from package-lock.json.

**Example:**
```bash
npm ci --prefer-offline --no-audit --progress=false
```

**Enable package compression.**  
Use zstd or zlib compression for improved download speeds.  

*Why?* Reduces bandwidth usage and installation time in production environments.

**Example:**
```bash
npm config set compression zstd
```

## Workspaces & Monorepo Management

**Use npm workspaces for related packages.**  
Organize related packages using npm's built-in workspace support.  

*Why?* Simplifies dependency management and enables efficient cross-package development.

**Example:**
```json
{
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces"
  }
}
```

**Implement hoisting for shared dependencies.**  
Let npm automatically hoist common dependencies to reduce duplication.  

*Why?* Reduces node_modules size and improves installation speed.

## Script Management Best Practices

**Use consistent script naming conventions.**  
Standardize script names across all projects in your organization.  

*Why?* Enables predictable workflows and easier onboarding for team members.

**Example:**
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "type-check": "tsc --noEmit"
  }
}
```

**Never use npm start for development.**  
Reserve npm start for production; use npm run dev for development.  

*Why?* Follows Node.js conventions and prevents confusion in deployment scripts.