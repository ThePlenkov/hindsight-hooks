# config-cascade Specification

## Purpose

Define the layered configuration system that resolves settings from multiple sources with a deterministic priority order.

## Requirements

### Requirement: Four-layer config resolution

The system SHALL resolve each configuration key by checking sources in priority order: defaults < settings.json < user config < environment variables.

#### Scenario: Environment variable wins
- **GIVEN** `HINDSIGHT_DEBUG=true` is set and `settings.json` has `"debug": false`
- **WHEN** config is loaded
- **THEN** `debug` resolves to `true`

#### Scenario: User config overrides package settings
- **GIVEN** `~/.hindsight/claude-code.json` sets `"recallBudget": "high"`
- **AND** `settings.json` sets `"recallBudget": "mid"`
- **WHEN** config is loaded
- **THEN** `recallBudget` resolves to `"high"`

#### Scenario: Default applies when nothing is set
- **GIVEN** no source sets `scoringThreshold`
- **WHEN** config is loaded
- **THEN** `scoringThreshold` resolves to `3` (the built-in default)

### Requirement: Environment variable naming convention

The system SHALL map config keys to environment variables using the `HINDSIGHT_` prefix and UPPER_SNAKE_CASE.

#### Scenario: Camel to snake mapping
- **GIVEN** a config key `hindsightApiUrl`
- **WHEN** checking for an environment override
- **THEN** read `HINDSIGHT_API_URL`

### Requirement: Agent-specific user config path

The system SHALL load user overrides from `~/.hindsight/<agentName>.json` where `agentName` comes from the plugin's `settings.json`.

#### Scenario: Claude Code user config
- **GIVEN** `settings.json` has `"agentName": "claude-code"`
- **WHEN** config is loaded
- **THEN** check `~/.hindsight/claude-code.json` for user overrides
