/**
 * Theory Agent for AgentCore
 * 
 * Specialized agent for theory analysis and evidence gathering. This agent
 * explicitly invokes the Query Agent to gather evidence before analyzing theories.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import {
  CICADAAgentBase,
  AgentInvocationParams,
  AgentInvocationResult,
} from '../base';
import { QueryAgent } from '../query';
import { profileService } from '../../services/profile-service';
import { TheoryProfile } from '@cicada/shared-types';

/**
 * Theory Agent Configuration
 */
const THEORY_AGENT_SYSTEM_PROMPT = `You are CICADA's Theory Agent, specialized in analyzing theories about Higurashi.

Your responsibilities:
1. Evaluate theories against script evidence
2. Identify supporting and contradicting evidence
3. Suggest theory refinements
4. Propose related theories
5. Maintain intellectual honesty - acknowledge uncertainty

Provide thorough, evidence-based analysis. Always ground your analysis in the evidence provided.`;

/**
 * Theory Agent
 * 
 * This agent provides theory analysis with explicit evidence gathering.
 * It ALWAYS invokes the Query Agent to gather evidence before analysis.
 */
export class TheoryAgent extends CICADAAgentBase {
  private queryAgent: QueryAgent;

  constructor() {
    super({
      name: 'CICADA-Theory',
      description: 'Theory analysis and evidence gathering specialist',
      systemPrompt: THEORY_AGENT_SYSTEM_PROMPT,
      modelId: 'us.amazon.nova-lite-v1:0',
      maxTokens: 2048,
      temperature: 0.7,
    });

    // Initialize Query Agent as sub-agent
    // Requirement 5.2: Register Query Agent for evidence gathering
    this.queryAgent = new QueryAgent();

    this.logActivity('info', 'Theory Agent initialized', {
      subAgents: ['QueryAgent'],
    });
  }

  /**
   * Invoke the Theory Agent with explicit evidence gathering
   * 
   * This method ALWAYS invokes the Query Agent to gather evidence
   * before performing theory analysis.
   * 
   * Requirements:
   * - 5.1: Maintain all existing functionality
   * - 5.2: Explicitly invoke Query Agent for evidence gathering
   * - 5.3: Stream responses via WebSocket
   * - 5.4: Update theory status in user profiles
   * - 5.5: Handle errors gracefully
   */
  async invokeAgent(params: AgentInvocationParams): Promise<AgentInvocationResult> {
    const startTime = Date.now();

    try {
      // Validate identity
      this.validateIdentity(params.identity);

      // Log invocation
      this.logActivity('info', 'Theory Agent invoked', {
        userId: params.identity.userId,
        query: params.query.substring(0, 50),
      });

      // Extract theory from query
      const theory = this.extractTheory(params.query);

      this.logActivity('info', 'Theory extracted', {
        userId: params.identity.userId,
        theory: theory.substring(0, 100),
      });

      // Requirement 5.2: Explicitly invoke Query Agent to gather evidence
      this.logActivity('info', 'Gathering evidence via Query Agent', {
        userId: params.identity.userId,
      });

      const evidenceQuery = `Find evidence related to: ${theory}`;
      const evidenceResult = await this.queryAgent.invokeAgent({
        query: evidenceQuery,
        identity: params.identity,
        memory: params.memory,
        context: params.context,
      });

      if (!evidenceResult.content) {
        throw new Error('Failed to gather evidence from Query Agent');
      }

      this.logActivity('info', 'Evidence gathered', {
        userId: params.identity.userId,
        evidenceLength: evidenceResult.content.length,
      });

      // Analyze theory against evidence
      const analysis = await this.analyzeTheory(theory, evidenceResult.content, params);

      // Requirement 5.4: Update theory profile
      await this.updateTheoryProfile(
        params.identity.userId,
        theory,
        analysis,
        evidenceResult.content
      );

      const processingTime = Date.now() - startTime;

      // Log success
      this.logActivity('info', 'Theory Agent completed', {
        userId: params.identity.userId,
        processingTime,
      });

      // Requirement 5.3: Return result for streaming
      return {
        content: analysis,
        metadata: {
          agentsInvoked: ['TheoryAgent', 'QueryAgent'],
          toolsUsed: ['semanticSearch'],
          processingTime,
        },
      };
    } catch (error) {
      // Requirement 5.5: Handle errors gracefully
      this.logActivity('error', 'Theory Agent failed', {
        userId: params.identity.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        content: this.formatError(error as Error),
        metadata: {
          agentsInvoked: ['TheoryAgent'],
          toolsUsed: [],
          processingTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Extract theory statement from user query
   * 
   * Removes common prefixes like "theory:", "hypothesis:", etc.
   * 
   * @param query - User query containing theory
   * @returns Extracted theory statement
   */
  private extractTheory(query: string): string {
    // Remove common theory prefixes
    const prefixes = [
      /^theory:\s*/i,
      /^hypothesis:\s*/i,
      /^analyze theory:\s*/i,
      /^test theory:\s*/i,
      /^validate:\s*/i,
      /^analyze:\s*/i,
    ];

    let theory = query;
    for (const prefix of prefixes) {
      theory = theory.replace(prefix, '');
    }

    return theory.trim();
  }

  /**
   * Analyze theory against gathered evidence
   * 
   * Uses the LLM to perform deep analysis of the theory based on
   * evidence gathered from the script.
   * 
   * @param theory - Theory statement to analyze
   * @param evidence - Evidence gathered from Query Agent
   * @param params - Original invocation parameters for context
   * @returns Analysis result
   */
  private async analyzeTheory(
    theory: string,
    evidence: string,
    params: AgentInvocationParams
  ): Promise<string> {
    // Extract conversation context
    const conversationContext = this.extractContext(params.memory);

    // Build analysis prompt
    let prompt = `Theory: ${theory}\n\nEvidence:\n${evidence}\n\n`;
    prompt += `Analyze this theory against the evidence. Identify:\n`;
    prompt += `1. Supporting evidence\n`;
    prompt += `2. Contradicting evidence\n`;
    prompt += `3. Gaps in evidence\n`;
    prompt += `4. Theory refinements or alternatives\n`;
    prompt += `5. Overall assessment (supported/refuted/inconclusive)\n\n`;
    prompt += `Provide a thorough, evidence-based analysis.`;

    if (conversationContext) {
      prompt = `Previous conversation:\n${conversationContext}\n\n${prompt}`;
    }

    // Invoke LLM for analysis
    const agentResult = await this.invoke(prompt);

    // Extract text content from agent result
    return agentResult.toString();
  }

  /**
   * Update theory profile in user's DynamoDB profiles
   * 
   * Requirement 5.4: Update theory status in user profiles
   * 
   * @param userId - User ID
   * @param theory - Theory statement
   * @param analysis - Analysis result
   * @param evidence - Evidence used for analysis
   */
  private async updateTheoryProfile(
    userId: string,
    theory: string,
    analysis: string,
    evidence: string
  ): Promise<void> {
    try {
      this.logActivity('info', 'Updating theory profile', {
        userId,
        theory: theory.substring(0, 50),
      });

      // Generate theory ID from theory statement
      const theoryId = this.generateTheoryId(theory);

      // Determine theory status from analysis
      const status = this.extractTheoryStatus(analysis);

      // Extract supporting and contradicting evidence from analysis
      const { supportingEvidence, contradictingEvidence } = this.extractEvidence(analysis);

      // Get or create theory profile
      const existingProfile = await profileService.getProfile(
        userId,
        'THEORY',
        theoryId
      );

      if (existingProfile) {
        // Update existing theory profile
        const theoryProfile = existingProfile as TheoryProfile;
        theoryProfile.theoryName = theory;
        theoryProfile.description = analysis.substring(0, 200); // Store truncated analysis
        theoryProfile.status = status;
        theoryProfile.supportingEvidence = supportingEvidence;
        theoryProfile.contradictingEvidence = contradictingEvidence;
        theoryProfile.refinements = [
          ...(theoryProfile.refinements || []),
          {
            timestamp: new Date().toISOString(),
            description: analysis.substring(0, 200),
            reasoning: evidence.substring(0, 200),
          },
        ];

        await profileService.updateProfile(theoryProfile);

        this.logActivity('info', 'Theory profile updated', {
          userId,
          theoryId,
          status,
        });
      } else {
        // Create new theory profile
        const newTheoryProfile: Omit<TheoryProfile, 'version' | 'createdAt' | 'updatedAt'> = {
          userId,
          profileType: 'THEORY',
          profileId: theoryId,
          theoryName: theory,
          description: analysis.substring(0, 200),
          status,
          supportingEvidence,
          contradictingEvidence,
          refinements: [
            {
              timestamp: new Date().toISOString(),
              description: analysis.substring(0, 200),
              reasoning: evidence.substring(0, 200),
            },
          ],
          relatedTheories: [],
        };

        await profileService.createProfile(newTheoryProfile);

        this.logActivity('info', 'Theory profile created', {
          userId,
          theoryId,
          status,
        });
      }
    } catch (error) {
      // Log error but don't fail the entire operation
      this.logActivity('error', 'Failed to update theory profile', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Generate a unique theory ID from theory statement
   * 
   * @param theory - Theory statement
   * @returns Theory ID
   */
  private generateTheoryId(theory: string): string {
    // Create a simple ID from the theory statement
    // In production, might want to use a hash or UUID
    return theory
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .substring(0, 50)
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Extract theory status from analysis
   * 
   * Looks for keywords in the analysis to determine if the theory
   * is supported, refuted, or needs refinement.
   * 
   * @param analysis - Analysis text
   * @returns Theory status
   */
  private extractTheoryStatus(analysis: string): 'proposed' | 'supported' | 'refuted' | 'refined' {
    const lowerAnalysis = analysis.toLowerCase();

    // Check for support keywords
    if (
      lowerAnalysis.includes('strongly supported') ||
      lowerAnalysis.includes('validated') ||
      lowerAnalysis.includes('confirmed') ||
      lowerAnalysis.includes('supported by')
    ) {
      return 'supported';
    }

    // Check for refutation keywords
    if (
      lowerAnalysis.includes('refuted') ||
      lowerAnalysis.includes('contradicted') ||
      lowerAnalysis.includes('disproven')
    ) {
      return 'refuted';
    }

    // Check for refinement keywords
    if (
      lowerAnalysis.includes('refined') ||
      lowerAnalysis.includes('needs refinement') ||
      lowerAnalysis.includes('alternative')
    ) {
      return 'refined';
    }

    // Default to proposed for new or inconclusive theories
    return 'proposed';
  }

  /**
   * Extract supporting and contradicting evidence from analysis
   * 
   * @param analysis - Analysis text
   * @returns Supporting and contradicting evidence citations
   */
  private extractEvidence(analysis: string): {
    supportingEvidence: Array<{
      episodeId: string;
      episodeName: string;
      chapterId: string;
      messageId: number;
      speaker?: string;
      textENG: string;
      textJPN?: string;
      nuance?: string;
    }>;
    contradictingEvidence: Array<{
      episodeId: string;
      episodeName: string;
      chapterId: string;
      messageId: number;
      speaker?: string;
      textENG: string;
      textJPN?: string;
      nuance?: string;
    }>;
  } {
    // For now, return empty arrays
    // In a more sophisticated implementation, we would parse the analysis
    // to extract specific citations from the evidence text
    return {
      supportingEvidence: [],
      contradictingEvidence: [],
    };
  }

  /**
   * Format error for user-friendly display
   * 
   * Requirement 5.5: Handle errors gracefully
   */
  protected formatError(error: Error): string {
    this.logActivity('error', 'Theory Agent error occurred', {
      error: error.message,
      stack: error.stack,
    });

    return 'I encountered an error analyzing the theory. Please try again or rephrase your theory.';
  }
}
