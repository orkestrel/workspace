# @orkestrel/workspace

A host-independent virtual file workspace for the `@orkestrel` line. It keeps immutable files in
an insertion-ordered path map, provides text editing and search, manages named workspaces with an
active selection, and persists snapshots through pluggable stores.

It is deliberately not a filesystem: it performs no disk access and owns no synchronization
lifecycle. Stores are the durability seam.

## Install

```sh
npm install @orkestrel/workspace
```

## Example

```ts
import { createWorkspaceManager } from '@orkestrel/workspace'

const workspaces = createWorkspaceManager()
const workspace = workspaces.add({ id: 'project' })

workspace.write('src/main.ts', 'export const answer = 42')
workspace.append('src/main.ts', '\n')

workspace.read('src/main.ts') // 'export const answer = 42\n'
workspace.search('answer') // one 1-based match
```

See the [workspace guide](guides/src/workspace.md) for the complete contract, edit semantics,
events, and store options.

## Requirements

- Node.js 22.12 or newer
- ESM and CommonJS consumers

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](LICENSE).
