# hook-lifecycle Specification

## Purpose

Define the four lifecycle events that every agent plugin must implement to give AI agents persistent memory via Hindsight.

## Requirements

### Requirement: Session start initializes memory infrastructure

The system SHALL pre-start the Hindsight daemon (if no external API is configured) and verify the memory bank exists before the agent begins work.

#### Scenario: Daemon auto-start
- **GIVEN** no `hindsightApiUrl` is configured
- **WHEN** `SessionStart` fires
- **THEN** start the `hindsight-embed` daemon on a free port
- **AND** persist the daemon PID and port to state

#### Scenario: External API configured
- **GIVEN** `hindsightApiUrl` is set
- **WHEN** `SessionStart` fires
- **THEN** skip daemon start and verify the bank exists via the API

### Requirement: Recall injects relevant memories before each prompt

The system SHALL query Hindsight for memories relevant to the user's prompt and inject them into the agent's context.

#### Scenario: Memories found
- **GIVEN** a user prompt is submitted and `autoRecall` is enabled
- **WHEN** `UserPromptSubmit` fires
- **THEN** query `/v1/recall` with the prompt text
- **AND** format results within `recallMaxTokens` limit
- **AND** output memories for injection into agent context

#### Scenario: No memories found
- **GIVEN** a user prompt is submitted
- **WHEN** Hindsight returns zero results
- **THEN** output nothing (silent no-op)

#### Scenario: Recall timeout
- **GIVEN** the Hindsight API does not respond within 60 seconds
- **WHEN** `UserPromptSubmit` fires
- **THEN** fail silently and let the agent proceed without memories

### Requirement: Retain stores valuable conversation content

The system SHALL score the conversation transcript for memory-worthiness and retain it to Hindsight only if it exceeds the scoring threshold.

#### Scenario: High-value transcript
- **GIVEN** `autoRetain` is enabled and `scoringEnabled` is true
- **WHEN** `Stop` fires with a transcript scoring above `scoringThreshold`
- **THEN** strip `<hindsight_memories>` tags (anti-feedback loop)
- **AND** retain the processed content via `/v1/retain`

#### Scenario: Low-value transcript
- **GIVEN** a transcript scores below `scoringThreshold`
- **WHEN** `Stop` fires
- **THEN** skip retention (do not store trivial conversations)

#### Scenario: Scoring disabled
- **GIVEN** `scoringEnabled` is false
- **WHEN** `Stop` fires
- **THEN** retain all transcripts unconditionally

### Requirement: Session end performs cleanup

The system SHALL reflect on the session and stop the daemon if it was auto-started.

#### Scenario: Daemon was auto-started
- **GIVEN** state contains a daemon PID
- **WHEN** `SessionEnd` fires
- **THEN** call `/v1/reflect` for session synthesis
- **AND** stop the daemon process
- **AND** clean up state files

#### Scenario: External API was used
- **GIVEN** no daemon PID in state
- **WHEN** `SessionEnd` fires
- **THEN** call `/v1/reflect` only (no process to stop)
