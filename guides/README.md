# Guides

The concept and directory index for `@orkestrel/workspace`, a virtual immutable-file map with an
editing surface, a registry, and pluggable snapshot stores.

## By concept

| Concept   | Spec                                   | Source                    | Tests                                 |
| --------- | -------------------------------------- | ------------------------- | ------------------------------------- |
| Workspace | [`src/workspace.md`](src/workspace.md) | [`src/core`](../src/core) | [`tests/src/core`](../tests/src/core) |

## By directory

| Directory  | Guide                                  |
| ---------- | -------------------------------------- |
| `src/core` | [`src/workspace.md`](src/workspace.md) |

## Dependency reference

These vendored guides document consumed packages rather than this package.

- [`src/contract.md`](src/contract.md) — total guards and contract shapes from
  `@orkestrel/contract`.
- [`src/database.md`](src/database.md) — driver-independent tables from
  `@orkestrel/database`.
- [`src/emitter.md`](src/emitter.md) — typed event observation from `@orkestrel/emitter`.
- [`src/guide.md`](src/guide.md) — documentation parity support from `@orkestrel/guide`.
- [`src/scaffold.md`](src/scaffold.md) — repository maintenance from `@orkestrel/scaffold`.

## See also

- [`AGENTS.md`](../AGENTS.md) — the repository's coding and documentation contract.
