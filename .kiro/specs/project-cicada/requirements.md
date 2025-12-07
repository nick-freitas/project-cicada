# Requirements Document

## Introduction

CICADA (Contextual Inference & Comprehensive Analysis Data Agent) is a full-stack AI agent system designed to analyze and discuss the visual novel "Higurashi no Naku Koro Ni". The system provides users with an intelligent conversational interface to explore the story, analyze theories, compare episodes, and understand the complex narrative structure across multiple story arcs. The system consists of a React frontend, AWS serverless backend using AgentCore, and leverages Amazon Bedrock for AI capabilities.

## Glossary

- **CICADA**: Contextual Inference & Comprehensive Analysis Data Agent - the AI agent system
- **Frontend**: The React-based web application that provides the user interface
- **Backend**: The AWS serverless infrastructure including Lambda functions, AgentCore agents, and data storage
- **AgentCore**: AWS service for building and deploying AI agents
- **Strands SDK**: TypeScript SDK for creating agents with AgentCore
- **Episode**: A story arc within Higurashi (e.g., Onikakushi, Watanagashi, Tatarigoroshi)
- **Arc**: Synonym for Episode - a complete story segment
- **Fragment**: A timeline or world-line variation within the Higurashi narrative structure
- **Script Data**: The JSON-formatted dialogue and narrative text from the visual novel
- **Chapter**: A subdivision of an episode, stored as individual JSON files (e.g., kageboushi_11.json, fragment_k6.json)
- **Episode Configuration**: Metadata file that maps chapter file name patterns to episode names and properties
- **File Name Pattern**: The prefix used in chapter file names (e.g., "kageboushi", "fragment_k6")
- **Message Entry**: A single dialogue or narrative line within the script with Japanese and English text
- **Theory**: A user-proposed or agent-suggested explanation of story events
- **Citation**: A reference to specific script passages including episode, chapter, speaker, and text
- **Session**: A single conversation instance between a user and CICADA
- **Memory**: Stored context from previous conversations used to inform current interactions
- **Knowledge Base**: The indexed and searchable repository of script data
- **Bedrock**: AWS service providing access to foundation models
- **Nova**: Amazon's Nova model family for AI inference
- **Maverick**: Alternative model option for experimentation
- **AWS Evals**: AWS service for evaluating AI model performance
- **Vector Database**: Storage system for semantic search using embeddings
- **Embedding**: Numerical representation of text for semantic similarity search
- **CDK**: AWS Cloud Development Kit for infrastructure as code
- **Cognito**: AWS authentication and user management service
- **DynamoDB**: AWS NoSQL database service
- **S3**: AWS object storage service
- **Lambda**: AWS serverless compute service
- **Profile**: A knowledge base entry about a story entity (character, location, episode, fragment group, or theory) that accumulates information over time - NOT a user profile
- **Character Profile**: Accumulated knowledge about a specific character from the Higurashi story
- **Location Profile**: Accumulated knowledge about a specific location in the Higurashi story
- **Episode Profile**: Accumulated knowledge about a specific episode or arc in the Higurashi story
- **Fragment Group Profile**: Accumulated knowledge about a group of episodes that share the same timeline or universe
- **Theory Profile**: Accumulated knowledge about a specific theory developed by the user, including supporting evidence, contradictions, and refinements over time
- **User Account**: Authentication credentials and personal settings for a human user of the system

## Requirements

### Requirement 1: Episode and Arc Metadata Management

**User Story:** As a system administrator, I want to define episode metadata and chapter mappings, so that the system can correctly organize and reference script files.

#### Acceptance Criteria

1. WHEN configuring the system THEN the System SHALL accept an episode configuration file that maps file name patterns to episode names and metadata
2. WHEN an episode is defined THEN the System SHALL store the episode name, arc type (Question/Answer), and associated chapter file patterns
3. WHEN a chapter file name is provided THEN the System SHALL resolve it to the correct episode using the configuration
4. WHEN displaying episode information THEN the System SHALL use the human-readable episode name rather than the file name prefix
5. WHEN querying by episode THEN the System SHALL support both file name patterns and human-readable episode names

### Requirement 2: Script Data Ingestion and Storage

**User Story:** As a system administrator, I want to ingest and store the Higurashi script data, so that CICADA can access and search the complete narrative content.

#### Acceptance Criteria

1. WHEN the system receives JSON script files THEN the System SHALL parse each file and extract MessageID, TextJPN, TextENG, type, and chapter metadata
2. WHEN script data is processed THEN the System SHALL store the data in S3 with appropriate indexing for retrieval
3. WHEN script data is stored THEN the System SHALL create embeddings for semantic search using Bedrock
4. WHEN a chapter file is ingested THEN the System SHALL use the episode configuration to associate it with the correct episode and chapter number
5. WHEN all script data is loaded THEN the System SHALL make it available to the Knowledge Base for agent queries

### Requirement 3: Knowledge Base and Semantic Search

**User Story:** As CICADA, I want to search the script data semantically while maintaining episode boundaries, so that I can find relevant passages without mixing contradictory information from different fragments.

#### Acceptance Criteria

1. WHEN CICADA receives a user query THEN the System SHALL perform semantic search across the Knowledge Base using embeddings
2. WHEN searching for specific episodes THEN the System SHALL filter results to only include passages from the specified episodes
3. WHEN searching across all arcs THEN the System SHALL return relevant passages from any episode with clear episode metadata for each result
4. WHEN a passage is retrieved THEN the System SHALL include the episode name, chapter number, MessageID, speaker, and full text
5. WHEN multiple relevant passages exist from different episodes THEN the System SHALL group results by episode to prevent mixing contradictory information

### Requirement 4: Multi-Agent Architecture and Conversation Handling

**User Story:** As a user, I want to interact with CICADA through natural conversation coordinated by specialized agents, so that I can explore the Higurashi narrative intuitively with optimized performance.

#### Acceptance Criteria

1. WHEN a user sends a message THEN the System SHALL route it to the Orchestrator Agent using AgentCore and Strands SDK
2. WHEN the Orchestrator Agent receives a query THEN it SHALL analyze the intent and route to appropriate specialized agents (Query Agent, Theory Agent, Profile Agent)
3. WHEN specialized agents process requests THEN they SHALL use Amazon Bedrock models (Nova or Maverick) for inference
4. WHEN the Orchestrator Agent coordinates responses THEN it SHALL aggregate results from specialized agents while maintaining conversation context
5. WHEN responding to the user THEN the System SHALL provide contextually relevant information based on the query scope while respecting episode boundaries

### Requirement 5: Citation and Source Attribution

**User Story:** As a user, I want to see exact sources for CICADA's statements, so that I can verify the information and understand the evidence.

#### Acceptance Criteria

1. WHEN CICADA makes a claim about the story THEN the System SHALL include citations with episode name, chapter number, and MessageID
2. WHEN providing a citation THEN the System SHALL include the full passage text in both English and Japanese if available
3. WHEN a passage has a speaker THEN the System SHALL identify the speaker in the citation
4. WHEN multiple passages support a claim THEN the System SHALL provide all relevant citations
5. WHEN no direct evidence exists THEN the System SHALL clearly indicate the response is inference or speculation

### Requirement 6: Translation Nuance and Linguistic Analysis

**User Story:** As a user, I want to understand linguistic nuances between the Japanese and English text, so that I can appreciate subtle meanings that may be lost in translation.

#### Acceptance Criteria

1. WHEN providing a citation with both Japanese and English text THEN the System SHALL analyze the texts for significant translation differences or nuances
2. WHEN the Japanese text conveys meaning, tone, or context not fully captured in the English translation THEN the System SHALL explain the nuance
3. WHEN linguistic elements in the Japanese text provide additional insight into character relationships, emotions, or story context THEN the System SHALL note this in a nuance section
4. WHEN the English translation adds, removes, or significantly alters meaning from the Japanese THEN the System SHALL identify and explain the difference
5. WHEN no significant nuances exist between the texts THEN the System SHALL not include unnecessary linguistic commentary

### Requirement 7: Theory Analysis and Validation

**User Story:** As a user, I want to collaboratively develop and refine theories with CICADA through iterative discussion, so that I can test my understanding and explore alternative interpretations.

#### Acceptance Criteria

1. WHEN a user proposes a theory THEN the System SHALL analyze it against script data and profile information for both supporting and contradicting evidence
2. WHEN the user challenges evidence presented by CICADA THEN the System SHALL re-evaluate the evidence and acknowledge if it was incorrect or irrelevant
3. WHEN CICADA's evidence is found to be incorrect due to profile mistakes THEN the System SHALL correct the relevant profiles
4. WHEN the user refines a theory based on CICADA's analysis THEN the System SHALL analyze the updated theory and provide new evidence assessment
5. WHEN the user requests CICADA to refine a theory THEN the System SHALL propose modifications that better fit the evidence and allow further user refinement

### Requirement 8: Proactive Connection and Theory Suggestion

**User Story:** As a user, I want CICADA to suggest connections between episodes and propose theories that improve over time as knowledge accumulates, so that I can discover insights I might have missed.

#### Acceptance Criteria

1. WHEN suggesting connections or theories THEN the System SHALL leverage character, location, and episode profiles to identify patterns
2. WHEN profiles are well-developed THEN the System SHALL generate more sophisticated and accurate theory suggestions than when profiles are sparse
3. WHEN a theory suggestion leads to new insights THEN the System SHALL update relevant profiles with the discovered information
4. WHEN updated profiles contain new information THEN the System SHALL use that information to generate improved future theory suggestions
5. WHEN suggesting a theory THEN the System SHALL provide supporting citations from the script and reference relevant profile information

### Requirement 9: Multi-Arc Comparison and Analysis

**User Story:** As a user, I want to compare events and patterns across different arcs and group related fragments, so that I can understand the fragment structure and identify which episodes share the same timeline or universe.

#### Acceptance Criteria

1. WHEN a user asks about similarities across arcs THEN the System SHALL analyze and compare events from multiple episodes
2. WHEN a user identifies fragments that share the same timeline or universe THEN the System SHALL treat those episodes as a related group for analysis
3. WHEN discussing an episode that is part of a fragment group THEN the System SHALL include information from other episodes in that group as contextually relevant
4. WHEN comparing specific arcs THEN the System SHALL limit analysis to the user-specified episodes or fragment groups
5. WHEN identifying similarities or differences THEN the System SHALL provide citations from each relevant arc with clear episode attribution

### Requirement 10: Fragment Grouping and Timeline Management

**User Story:** As a user, I want to define and manage groups of episodes that share the same timeline or universe, so that CICADA can provide contextually appropriate analysis across related fragments.

#### Acceptance Criteria

1. WHEN a user identifies episodes that share a timeline THEN the System SHALL create or update a fragment group containing those episodes
2. WHEN a fragment group is defined THEN the System SHALL store the grouping for use in future conversations
3. WHEN analyzing an episode within a fragment group THEN the System SHALL consider information from all episodes in that group as contextually relevant
4. WHEN a user modifies fragment groupings THEN the System SHALL update the groupings and apply them to subsequent queries
5. WHEN displaying information from a fragment group THEN the System SHALL clearly indicate which episode each piece of information comes from

### Requirement 11: Episode-Specific and Character Analysis

**User Story:** As a user, I want to ask questions about specific episodes, characters, and timelines, so that I can explore focused aspects of the narrative without mixing contradictory information from different fragments.

#### Acceptance Criteria

1. WHEN a user asks about a specific episode THEN the System SHALL focus responses exclusively on that episode's content
2. WHEN a user asks about a character THEN the System SHALL retrieve and analyze passages featuring that character with episode context
3. WHEN a user asks about timelines or events in a specific episode THEN the System SHALL NOT include contradictory information from other episodes unless explicitly comparing
4. WHEN information from other episodes is contextually relevant THEN the System SHALL include it with clear episode attribution and explain the relationship
5. WHEN a character appears across multiple episodes THEN the System SHALL distinguish between their appearances in different arcs and avoid conflating fragment-specific details

### Requirement 12: Conversation Memory and Context Management

**User Story:** As a user, I want CICADA to remember our conversation history, so that discussions can build on previous topics and theories.

#### Acceptance Criteria

1. WHEN within a single session THEN the System SHALL maintain full conversation context for coherent dialogue
2. WHEN a new session begins THEN the System SHALL treat it as a fresh conversation
3. WHEN relevant information exists from previous sessions THEN the System SHALL retrieve and incorporate it into responses
4. WHEN a user discusses theories across sessions THEN the System SHALL recall and reference previously discussed theories
5. WHEN conversation context grows large THEN the System SHALL compact or summarize older context to manage token costs

### Requirement 13: Long-Term Memory and Theory Persistence

**User Story:** As a user, I want CICADA to remember theories, connections, and profiles I've developed, so that my personal insights accumulate over time without being influenced by other users.

#### Acceptance Criteria

1. WHEN a user discusses a theory THEN the System SHALL store it in long-term memory associated with that specific user
2. WHEN a theory is validated or refuted THEN the System SHALL update the stored theory with the conclusion in that user's memory
3. WHEN a new theory relates to a previous theory THEN the System SHALL retrieve and reference the previous discussion from that user's memory
4. WHEN retrieving stored theories or profiles THEN the System SHALL only access data associated with the current user
5. WHEN memory storage grows THEN the System SHALL maintain efficient retrieval without degrading performance

### Requirement 14: Character Profile Knowledge Base

**User Story:** As a user, I want CICADA to build and maintain my personal character profiles over time, so that my accumulated knowledge about characters is preserved without being influenced by other users' interpretations.

#### Acceptance Criteria

1. WHEN a conversation reveals information about a character THEN the System SHALL extract and store that information in the character's profile for that specific user
2. WHEN a character profile does not exist for a user THEN the System SHALL create it automatically when that user first discusses that character
3. WHEN answering questions about a character THEN the System SHALL retrieve and use information only from that user's character profile
4. WHEN new information about a character is discovered THEN the System SHALL update only that user's character profile with the new information
5. WHEN a different user accesses the system THEN the System SHALL maintain separate character profiles for each user

### Requirement 15: Location Profile Knowledge Base

**User Story:** As a user, I want CICADA to build and maintain my personal location profiles over time, so that my accumulated knowledge about places is preserved without being influenced by other users' interpretations.

#### Acceptance Criteria

1. WHEN a conversation reveals information about a location THEN the System SHALL extract and store that information in the location's profile for that specific user
2. WHEN a location profile does not exist for a user THEN the System SHALL create it automatically when that user first discusses that location
3. WHEN answering questions about a location THEN the System SHALL retrieve and use information only from that user's location profile
4. WHEN new information about a location is discovered THEN the System SHALL update only that user's location profile with the new information
5. WHEN a different user accesses the system THEN the System SHALL maintain separate location profiles for each user

### Requirement 16: Episode Profile Knowledge Base

**User Story:** As a user, I want CICADA to build and maintain my personal episode profiles over time, so that my accumulated knowledge about episodes is preserved without being influenced by other users' interpretations.

#### Acceptance Criteria

1. WHEN a conversation reveals information about an episode THEN the System SHALL extract and store that information in the episode's profile for that specific user
2. WHEN an episode profile does not exist for a user THEN the System SHALL create it automatically when that user first discusses that episode
3. WHEN answering questions about an episode THEN the System SHALL retrieve and use information only from that user's episode profile
4. WHEN new information about an episode is discovered THEN the System SHALL update only that user's episode profile with the new information
5. WHEN a different user accesses the system THEN the System SHALL maintain separate episode profiles for each user

### Requirement 17: Fragment Group Profile Knowledge Base

**User Story:** As a user, I want CICADA to build and maintain my personal fragment group profiles over time, so that my accumulated knowledge about related timelines is preserved without being influenced by other users' interpretations.

#### Acceptance Criteria

1. WHEN a fragment group is created or identified THEN the System SHALL create a profile for that fragment group for that specific user
2. WHEN conversations reveal information about a fragment group THEN the System SHALL extract and store that information in that user's fragment group profile
3. WHEN answering questions about episodes within a fragment group THEN the System SHALL retrieve and use information only from that user's fragment group profile
4. WHEN new connections or insights about a fragment group are discovered THEN the System SHALL update only that user's fragment group profile
5. WHEN a different user accesses the system THEN the System SHALL maintain separate fragment group profiles for each user

### Requirement 18: Theory Profile Knowledge Base

**User Story:** As a user, I want CICADA to build and maintain my personal theory profiles over time, so that theories I develop across multiple sessions are preserved and can be referenced and refined.

#### Acceptance Criteria

1. WHEN a user proposes or develops a theory THEN the System SHALL create or update a theory profile for that specific user
2. WHEN a theory is discussed across multiple sessions THEN the System SHALL accumulate all related information in the theory's profile
3. WHEN answering questions about a theory THEN the System SHALL retrieve and use information from that user's theory profile
4. WHEN a theory is validated, refuted, or refined THEN the System SHALL update the theory profile with the new status and supporting evidence
5. WHEN a different user accesses the system THEN the System SHALL maintain separate theory profiles for each user

### Requirement 19: Profile Management Frontend Interface

**User Story:** As a user, I want to view and edit character, location, episode, fragment group, and theory profiles, so that I can review accumulated knowledge and make corrections when needed.

#### Acceptance Criteria

1. WHEN a user accesses the Frontend THEN the System SHALL provide a Character Profiles section listing all created character profiles
2. WHEN a user accesses the Frontend THEN the System SHALL provide a Location Profiles section listing all created location profiles
3. WHEN a user accesses the Frontend THEN the System SHALL provide an Episode Profiles section listing all created episode profiles
4. WHEN a user accesses the Frontend THEN the System SHALL provide a Fragment Groups section listing all created fragment group profiles
5. WHEN a user accesses the Frontend THEN the System SHALL provide a Theories section listing all created theory profiles
6. WHEN a user selects a profile THEN the System SHALL display all stored information for that character, location, episode, fragment group, or theory
7. WHEN a user edits a profile THEN the System SHALL save the changes and use the updated information in future conversations

### Requirement 20: Data Persistence and Migration

**User Story:** As a developer, I want profile data to persist across infrastructure changes, so that accumulated knowledge is not lost when the system is updated.

#### Acceptance Criteria

1. WHEN infrastructure changes are deployed THEN the System SHALL preserve all existing profile data
2. WHEN the profile schema is updated THEN the System SHALL migrate existing data to the new schema without data loss
3. WHEN deploying updates THEN the System SHALL implement backward-compatible changes to data structures
4. WHEN data migration is required THEN the System SHALL provide migration scripts that transform old data to new formats
5. WHEN profile data is stored THEN the System SHALL use a versioned schema to support future migrations

### Requirement 21: User Authentication and Multi-User Support

**User Story:** As a system administrator, I want to manage multiple user accounts, so that different users can have personalized experiences with separate conversation histories.

#### Acceptance Criteria

1. WHEN a user accesses the system THEN the System SHALL authenticate them using AWS Cognito
2. WHEN a user logs in THEN the System SHALL load their specific conversation history and stored theories
3. WHEN multiple users are active THEN the System SHALL maintain separate memory and context for each user
4. WHEN the system initializes THEN the System SHALL support at least three user accounts (admin, Nick, Naizak)
5. WHEN a user's session expires THEN the System SHALL require re-authentication before allowing access

### Requirement 22: React Frontend Interface and WebSocket Streaming

**User Story:** As a user, I want an intuitive web interface to chat with CICADA with real-time streaming responses and reliable reconnection, so that I can see the agent's thinking as it generates answers without losing my place.

#### Acceptance Criteria

1. WHEN a user accesses the application THEN the Frontend SHALL display a chat interface built with React and Vite
2. WHEN a user sends a message THEN the Frontend SHALL generate a unique requestId and establish a WebSocket connection to stream the response in real-time
3. WHEN CICADA generates a response THEN the Frontend SHALL display the text as it streams, providing immediate feedback
4. WHEN the WebSocket connection drops THEN the Frontend SHALL automatically reconnect and resume receiving response chunks using the requestId
5. WHEN CICADA provides citations THEN the Frontend SHALL display them in a readable format with episode and chapter information
6. WHEN navigating the application THEN the Frontend SHALL use React Router for client-side routing
7. WHEN a user logs in THEN the Frontend SHALL display their conversation history and allow starting new sessions

### Requirement 23: Request Tracking and Reconnection Handling

**User Story:** As a user, I want my requests to be tracked and recoverable, so that I don't lose responses if my connection drops.

#### Acceptance Criteria

1. WHEN a user sends a message THEN the System SHALL generate a unique requestId and store the request with status "processing"
2. WHEN a response is being generated THEN the System SHALL track the requestId, userId, connectionId, and accumulated response
3. WHEN a WebSocket connection drops during response generation THEN the System SHALL continue processing and store response chunks
4. WHEN a user reconnects THEN the System SHALL allow resuming response delivery using the requestId
5. WHEN a request completes THEN the System SHALL update the status to "complete" and store the full response for conversation history

### Requirement 24: AWS Infrastructure and Deployment

**User Story:** As a developer, I want infrastructure defined as code with proper orchestration and messaging, so that the system can be deployed and managed consistently.

#### Acceptance Criteria

1. WHEN deploying the system THEN the Infrastructure SHALL be defined using AWS CDK in TypeScript
2. WHEN the Backend is deployed THEN the System SHALL use AWS Lambda for serverless compute
3. WHEN real-time communication is required THEN the System SHALL use API Gateway WebSocket APIs for streaming responses
4. WHEN asynchronous processing is needed THEN the System SHALL use SQS queues for reliable message handling
5. WHEN orchestrating complex workflows THEN the System SHALL use Step Functions or EventBridge for coordination
6. WHEN storing data THEN the System SHALL use DynamoDB for conversation memory, user data, and profiles
7. WHEN serving the Frontend THEN the System SHALL use S3 and CloudFront for static hosting
8. WHEN the infrastructure is provisioned THEN the System SHALL configure all services to operate within the $100 per month budget constraint

### Requirement 25: Model Selection and Experimentation

**User Story:** As a developer, I want to experiment with different Bedrock models, so that I can optimize for performance, cost, and response quality.

#### Acceptance Criteria

1. WHEN configuring the agent THEN the System SHALL support selecting between Nova and Maverick models
2. WHEN switching models THEN the System SHALL maintain consistent agent behavior and capabilities
3. WHEN a model is selected THEN the System SHALL use it for all inference requests until changed
4. WHEN experimenting with models THEN the System SHALL track which model generated each response
5. WHEN comparing models THEN the System SHALL provide configuration options without requiring code changes

### Requirement 26: Model Evaluation and Quality Assurance

**User Story:** As a developer, I want to evaluate model performance using AWS Evals, so that I can measure and improve CICADA's accuracy and usefulness.

#### Acceptance Criteria

1. WHEN evaluating citation accuracy THEN the System SHALL measure whether retrieved passages match the actual script content
2. WHEN evaluating theory coherence THEN the System SHALL assess whether theories properly incorporate contextual information
3. WHEN evaluating story coherence THEN the System SHALL verify that information from different episodes is kept distinct and accurate
4. WHEN evaluating overall correctness THEN the System SHALL measure whether responses meet expected quality standards
5. WHEN running evaluations THEN the System SHALL use AWS Evals to generate performance metrics and reports

### Requirement 27: Cost Management and Optimization

**User Story:** As a system administrator, I want to keep operational costs under $100 per month with proactive alerting, so that the project remains financially sustainable.

#### Acceptance Criteria

1. WHEN the system operates THEN the Total Monthly Cost SHALL remain below $100
2. WHEN daily costs exceed $3 THEN the System SHALL trigger a CloudWatch alarm and send an alert notification
3. WHEN managing context THEN the System SHALL implement token optimization strategies to reduce inference costs
4. WHEN storing data THEN the System SHALL use cost-effective storage options (S3, DynamoDB)
5. WHEN serving requests THEN the System SHALL optimize Lambda execution time to minimize compute costs
6. WHEN monitoring costs THEN the System SHALL provide visibility into spending across all AWS services

### Requirement 28: TypeScript Implementation

**User Story:** As a developer, I want the entire codebase in TypeScript, so that the system benefits from type safety and consistent tooling.

#### Acceptance Criteria

1. WHEN writing Backend code THEN the System SHALL use TypeScript for all Lambda functions and CDK infrastructure
2. WHEN creating agents THEN the System SHALL use the TypeScript Strands SDK
3. WHEN building the Frontend THEN the System SHALL use TypeScript with React
4. WHEN compiling code THEN the System SHALL enforce strict type checking
5. WHEN integrating components THEN the System SHALL use shared TypeScript types across Frontend and Backend
