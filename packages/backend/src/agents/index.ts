/**
 * CICADA AgentCore Module
 * 
 * This module provides the foundation for building AgentCore agents
 * using the Strands SDK. It includes base classes, types, and utilities
 * for creating specialized agents with deterministic tool invocation.
 */

// Re-export Strands SDK for convenience
export { Agent, FunctionTool, tool } from '@strands-agents/sdk';
export type { AgentConfig, Tool, ToolContext } from '@strands-agents/sdk';

// Base classes
export * from './base';

// Types
export * from './types';
