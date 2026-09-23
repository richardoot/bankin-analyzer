// The pnpm version lives in one place, "packageManager" in the root
// package.json: corepack reads it in the podman images and pnpm itself
// switches to it locally. Vercel is the exception — its bundled corepack
// cannot launch pnpm 12, so the two vercel.json files spell the version out
// in `npx pnpm@x.y.z …` commands. This keeps those copies from drifting.
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'))

const pinned = read('package.json').packageManager?.match(/^pnpm@(\S+)$/)?.[1]
if (!pinned) {
  console.error('package.json: "packageManager" must be "pnpm@<version>"')
  process.exit(1)
}

let drift = false
for (const file of ['backend/vercel.json', 'frontend/vercel.json']) {
  const config = read(file)
  for (const key of ['installCommand', 'buildCommand']) {
    const found = config[key]?.match(/npx pnpm@(\S+)/)?.[1]
    if (found !== pinned) {
      console.error(
        `${file}: ${key} uses pnpm@${found ?? '?'}, packageManager says ${pinned}`
      )
      drift = true
    }
  }
}
process.exit(drift ? 1 : 0)
