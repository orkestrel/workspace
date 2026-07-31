# Guides

The specification index for `@orkestrel/workspace` — a path-keyed map of immutable files with an
editing surface, a registry of named workspaces with one active selection, and pluggable snapshot
stores with explicit workspace teardown. Each guide is the contract for its module: what the
module exports, what each call does, and what it deliberately does not do. Parity tests hold these
documents and the source to each other, so a guide that drifts fails.

## By concept

| Concept   | Spec                                   | Source                    | Tests                                 |
| --------- | -------------------------------------- | ------------------------- | ------------------------------------- |
| Workspace | [`src/workspace.md`](src/workspace.md) | [`src/core`](../src/core) | [`tests/src/core`](../tests/src/core) |

## By directory

| Directory  | Guide                                  |
| ---------- | -------------------------------------- |
| `src/core` | [`src/workspace.md`](src/workspace.md) |

## Dependency reference

These vendored guides document the packages this one consumes. They are mirrors kept for reading,
not contracts this repository owns.

- [`src/contract.md`](src/contract.md) — total guards and contract shapes from
  `@orkestrel/contract`.
- [`src/database.md`](src/database.md) — driver-independent tables from
  `@orkestrel/database`.
- [`src/emitter.md`](src/emitter.md) — typed event observation from `@orkestrel/emitter`.
- [`src/guide.md`](src/guide.md) — documentation parity support from `@orkestrel/guide`.
- [`src/scaffold.md`](src/scaffold.md) — repository maintenance from `@orkestrel/scaffold`.

## See also

- [`AGENTS.md`](../AGENTS.md) — the repository's coding and documentation contract.
