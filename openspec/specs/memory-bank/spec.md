# memory-bank Specification

## Purpose

Define how memory banks are identified, created, and managed across agent sessions.

## Requirements

### Requirement: Dynamic bank IDs

The system SHALL support configurable bank identifiers so different agents, projects, or contexts can maintain separate memory stores.

#### Scenario: Per-agent banks
- **GIVEN** Claude Code uses `bankId: "claude_code"` and Devin uses `bankId: "devin"`
- **WHEN** both agents retain memories
- **THEN** memories are stored in separate banks
- **AND** recall queries only search the agent's own bank

### Requirement: Bank auto-creation on session start

The system SHALL verify the configured bank exists during `SessionStart` and create it if it doesn't.

#### Scenario: First session with a new bank ID
- **GIVEN** `bankId: "my-project"` is configured but the bank doesn't exist
- **WHEN** `SessionStart` fires
- **THEN** create the bank via the Hindsight API
- **AND** proceed normally

### Requirement: Mission-driven memory

The system SHALL support an optional `missions` array in config that provides high-level context to the Hindsight API about what kind of information to prioritize during recall.

#### Scenario: Mission configured
- **GIVEN** `missions: ["Track architectural decisions", "Remember user preferences"]`
- **WHEN** performing recall
- **THEN** include missions in the recall query context to bias results toward relevant memories
