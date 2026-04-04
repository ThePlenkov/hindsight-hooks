# content-processing Specification

## Purpose

Define how conversation transcripts are scored, filtered, and prepared before retention to Hindsight.

## Requirements

### Requirement: Score-before-store gate

The system SHALL evaluate every transcript for memory-worthiness before deciding to retain it, preventing low-value content from polluting the memory bank.

#### Scenario: Transcript with root cause analysis
- **GIVEN** a transcript contains debugging insights and a root cause fix
- **WHEN** scored
- **THEN** score is above `scoringThreshold`

#### Scenario: Trivial "hello world" exchange
- **GIVEN** a transcript is a simple greeting or trivial question
- **WHEN** scored
- **THEN** score is below `scoringThreshold` and content is NOT retained

### Requirement: Anti-feedback loop stripping

The system SHALL remove all `<hindsight_memories>` XML tags and their content from transcripts before retention to prevent memories from compounding on themselves.

#### Scenario: Transcript contains injected memories
- **GIVEN** a transcript includes `<hindsight_memories>...</hindsight_memories>` from a previous recall
- **WHEN** processed for retention
- **THEN** the memory tags and their content are stripped
- **AND** surrounding content is preserved intact

### Requirement: Token-bounded recall output

The system SHALL truncate recalled memories to fit within `recallMaxTokens` to avoid consuming excessive context window space.

#### Scenario: Many memories returned
- **GIVEN** Hindsight returns 5000 tokens of memories
- **AND** `recallMaxTokens` is 1024
- **WHEN** formatting recall output
- **THEN** output is truncated to ~1024 tokens
- **AND** higher-relevance memories are preserved over lower ones

### Requirement: Silent failure on all hook errors

The system SHALL never crash the host agent. All errors in hooks MUST be caught and logged to stderr (if debug is enabled), allowing the agent to proceed normally.

#### Scenario: API unreachable during recall
- **GIVEN** the Hindsight API is down
- **WHEN** `UserPromptSubmit` fires
- **THEN** the hook exits with code 0 and empty stdout
- **AND** the agent proceeds without memories
