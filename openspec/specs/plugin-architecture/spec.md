# plugin-architecture Specification

## Purpose

Define the layered plugin architecture that enables thin agent-specific wrappers over shared hook pipelines.

## Requirements

### Requirement: One external dependency

The system SHALL depend on exactly one npm package: `@vectorize-io/hindsight-client`. All other functionality is implemented in the monorepo.

#### Scenario: Adding a feature
- **WHEN** implementing new functionality
- **THEN** use the hindsight-client SDK or implement in core/plugin-base
- **AND** do NOT add additional npm dependencies

### Requirement: Three-layer architecture

The system SHALL separate concerns into core (business logic), plugin-base (hook orchestration), and plugin-* (agent-specific thin wrappers).

#### Scenario: New agent plugin
- **GIVEN** a developer wants to add memory to a new AI agent
- **WHEN** creating a plugin
- **THEN** the plugin imports `performRecall`, `performRetain`, etc. from `@hindsight/plugin-base`
- **AND** the plugin only contains agent-specific I/O formatting (typically 13-73 lines per hook)

### Requirement: Built packages vs native TypeScript

Core and plugin-base SHALL compile to `dist/` via tsdown because Node's native TS stripping doesn't process `node_modules`. Agent plugins SHALL run as native `.ts` files directly via `node --experimental-strip-types` or `bun`.

#### Scenario: Build graph
- **GIVEN** a developer runs `npm run build`
- **WHEN** nx resolves the task graph
- **THEN** `core` builds first, then `plugin-base` (which depends on core)
- **AND** plugin-claude, plugin-devin, and mcp-server do NOT have build targets

### Requirement: Plugin I/O contract

Each plugin SHALL read JSON from stdin and write to stdout. The output format is agent-specific: Claude expects plain text, Devin expects `{"result": "..."}`.

#### Scenario: Claude recall hook
- **GIVEN** Claude Code fires `UserPromptSubmit`
- **WHEN** the recall hook runs
- **THEN** it reads `{"prompt": "...", "session_id": "..."}` from stdin
- **AND** writes plain text memories to stdout

#### Scenario: Devin recall hook
- **GIVEN** Devin fires `UserPromptSubmit`
- **WHEN** the recall hook runs
- **THEN** it reads `{"prompt": "...", "session_id": "..."}` from stdin
- **AND** writes `{"result": "<memories>"}` JSON to stdout
