# Product Overview

CICADA (Contextual Inference & Comprehensive Analysis Data Agent) is a full-stack AI agent system for analyzing the visual novel "Higurashi no Naku Koro Ni". The system enables users to explore the complex narrative through natural conversation, build knowledge over time through user-specific profiles, and develop theories collaboratively with specialized AI agents.

## Core Capabilities

- **Multi-Agent Architecture**: Orchestrator coordinates specialized agents (Query, Theory, Profile) for optimized performance
- **Real-Time Streaming**: WebSocket-based response streaming with automatic reconnection handling
- **User-Specific Profiles**: Character, Location, Episode, Fragment Group, and Theory profiles that accumulate knowledge over time
- **Episode Boundary Enforcement**: Prevents mixing contradictory information from different story fragments
- **Linguistic Nuance Analysis**: Compares Japanese and English text for deeper insights
- **Theory Development**: Collaborative theory analysis with evidence gathering and refinement

## Key Constraints

- **Budget**: Designed to operate under $100/month on AWS
- **Users**: Initially supports 3 users (admin, Nick, Naizak)
- **Episode Structure**: Maintains strict boundaries between story arcs to prevent fragment confusion
- **User Isolation**: All profiles and theories are user-specific and never shared between users
