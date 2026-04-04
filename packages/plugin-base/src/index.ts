// Re-export core essentials that plugin hooks need
export {
  loadConfig, debug,
  type PluginConfig, type HookInput, type Message,
} from "@hindsight/core";

// Export hook pipelines
export * from "./hooks.js";
