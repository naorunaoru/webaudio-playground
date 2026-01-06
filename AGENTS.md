# Agent Instructions

Guidelines for AI agents working on this codebase.

## Documentation

Architecture and implementation docs are in `docs/`. Keep them current.

### Key Documentation

- **[docs/ui/](docs/ui/)** — UI component library documentation
  - [roadmap.md](docs/ui/roadmap.md) — Implementation checklist (update when completing components)
  - Component specs, types, hooks, and design guidelines

- **[docs/nodes/](docs/nodes/)** — Audio node system documentation
  - [README.md](docs/nodes/README.md) — Overview and quick start
  - [node-catalog.md](docs/nodes/node-catalog.md) — Reference for all implemented nodes
  - Architecture docs: overview, types, graph-definition, audio-runtime, registration, event-flow, wasm

### Documentation Maintenance

When making changes to the codebase:

1. **Check if docs need updating** — If you modify a component's API, behavior, or add new features, update the relevant documentation.

2. **Update the roadmap** — When completing a component or feature listed in [docs/ui/roadmap.md](docs/ui/roadmap.md):
   - Check off the item `[x]`
   - Add file path reference if not present
   - Note any deviations from the original plan

3. **Keep docs accurate** — If implementation differs from documentation, update the docs to reflect reality. Accurate docs > aspirational docs.

4. **New components** — When adding new components:
   - Add to the appropriate doc file (controls.md, primitives.md, etc.)
   - Add to roadmap.md
   - Follow existing patterns and type interfaces

### What NOT to Document

- Don't create new markdown files without being asked
- Don't add excessive inline comments — code should be self-documenting
- Don't document implementation details that are obvious from the code

## Code Style

- TypeScript with strict mode
- React functional components with hooks
- Follow existing patterns in `src/ui/` and `src/nodes/`
