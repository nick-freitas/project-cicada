import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { queryAgent, QueryAgentRequest } from './query-agent';
import { profileService } from '../services/profile-service';
import { TheoryProfile, Citation } from '@cicada/shared-types';
import { logger } from '../utils/logger';

const MODEL_ID = process.env.MODEL_ID || 'amazon.nova-lite-v1:0';

export interface TheoryAgentRequest {
  userId: string;
  theoryName?: string;
  theoryDescription: string;
  userChallenge?: string;
  requestRefinement?: boolean;
  episodeContext?: string[];
  fragmentGroup?: string;
}

export interface TheoryAgentResponse {
  analysis: string;
  supportingEvidence: Citation[];
  contradictingEvidence: Citation[];
  refinementSuggestions?: TheoryRefinement[];
  profileUpdates: ProfileUpdate[];
  profileCorrections: ProfileCorrection[];
}

export interface TheoryRefinement {
  description: string;
  reasoning: string;
  supportingCitations: Citation[];
}

export interface ProfileUpdate {
  profileType: string;
  profileId: string;
  updateDescription: string;
}

export interface ProfileCorrection {
  profileType: string;
  profileId: string;
  incorrectInformation: string;
  correctedInformation: string;
  reasoning: string;
}

/**
 * Theory Agent - Specialized agent for theory analysis and development
 * 
 * Responsibilities:
 * - Analyze user-proposed theories
 * - Gather supporting and contradicting evidence
 * - Suggest theory refinements
 * - Propose new theories based on patterns
 * - Validate theories against script data
 * - Correct profiles when errors are discovered
 */
export class TheoryAgent {
  private bedrockClient: BedrockRuntimeClient;

  constructor(bedrockClient?: BedrockRuntimeClient) {
    this.bedrockClient = bedrockClient || new BedrockRuntimeClient({ 
      region: process.env.AWS_REGION || 'us-east-1' 
    });
  }

  /**
   * Analyze a theory and provide evidence-based assessment
   */
  async analyzeTheory(request: TheoryAgentRequest): Promise<TheoryAgentResponse> {
    try {
      logger.info('Theory Agent analyzing theory', {
        userId: request.userId,
        theoryName: request.theoryName,
        hasChallenge: !!request.userChallenge,
      });

      // Step 1: Retrieve existing theory profile if it exists
      const existingTheory = request.theoryName
        ? await this.retrieveTheoryProfile(request.userId, request.theoryName)
        : null;

      // Step 2: Gather evidence by invoking Query Agent
      const evidenceResults = await this.gatherEvidence(request);

      // Step 3: Analyze theory against evidence
      const analysis = await this.performTheoryAnalysis(
        request,
        existingTheory,
        evidenceResults
      );

      // Step 4: Identify profile corrections if user challenged evidence
      // Property 11: Profile Correction Propagation
      const profileCorrections = request.userChallenge
        ? await this.identifyProfileCorrections(
            request.userId,
            request.userChallenge,
            evidenceResults
          )
        : [];

      // Step 5: Apply profile corrections
      for (const correction of profileCorrections) {
        await this.applyProfileCorrection(request.userId, correction);
      }

      // Step 6: Generate refinement suggestions if requested
      const refinementSuggestions = request.requestRefinement
        ? await this.generateRefinements(request, analysis, evidenceResults)
        : undefined;

      // Step 7: Identify profile updates from new insights
      // Property 13: Profile Update on Insight
      const profileUpdates = await this.identifyProfileUpdates(
        request.userId,
        analysis,
        evidenceResults
      );

      // Step 8: Update or create theory profile
      await this.updateTheoryProfile(request, analysis, evidenceResults);

      logger.info('Theory Agent completed analysis', {
        userId: request.userId,
        supportingCount: analysis.supportingEvidence.length,
        contradictingCount: analysis.contradictingEvidence.length,
        correctionsCount: profileCorrections.length,
        updatesCount: profileUpdates.length,
      });

      return {
        analysis: analysis.analysisText,
        supportingEvidence: analysis.supportingEvidence,
        contradictingEvidence: analysis.contradictingEvidence,
        refinementSuggestions,
        profileUpdates,
        profileCorrections,
      };
    } catch (error) {
      logger.error('Error in Theory Agent', { error, userId: request.userId });
      throw error;
    }
  }

  /**
   * Suggest new theories based on patterns in profiles
   */
  async suggestTheories(
    userId: string,
    episodeContext?: string[]
  ): Promise<TheorySuggestion[]> {
    try {
      logger.info('Theory Agent suggesting theories', { userId, episodeContext });

      // Step 1: Retrieve relevant profiles
      const characterProfiles = await profileService.listProfilesByType(userId, 'CHARACTER');
      const episodeProfiles = await profileService.listProfilesByType(userId, 'EPISODE');
      const locationProfiles = await profileService.listProfilesByType(userId, 'LOCATION');

      // Step 2: Analyze patterns across profiles
      const suggestions = await this.analyzeProfilePatterns(
        characterProfiles,
        episodeProfiles,
        locationProfiles,
        episodeContext
      );

      logger.info('Theory Agent generated suggestions', {
        userId,
        count: suggestions.length,
      });

      return suggestions;
    } catch (error) {
      logger.error('Error suggesting theories', { error, userId });
      throw error;
    }
  }

  /**
   * Retrieve existing theory profile
   */
  private async retrieveTheoryProfile(
    userId: string,
    theoryName: string
  ): Promise<TheoryProfile | null> {
    const profileId = this.generateProfileId(theoryName);
    const profile = await profileService.getProfile(userId, 'THEORY', profileId);
    
    if (profile && profile.profileType === 'THEORY') {
      return profile as TheoryProfile;
    }
    
    return null;
  }

  /**
   * Gather evidence for theory by invoking Query Agent
   */
  private async gatherEvidence(request: TheoryAgentRequest): Promise<GatheredEvidence> {
    // Build search queries based on theory description
    const searchQueries = await this.generateEvidenceQueries(request.theoryDescription);

    const allCitations: Citation[] = [];
    const queryResponses: string[] = [];

    // Execute each search query
    for (const query of searchQueries) {
      const queryRequest: QueryAgentRequest = {
        query,
        userId: request.userId,
        episodeContext: request.episodeContext,
        fragmentGroup: request.fragmentGroup,
      };

      const queryResponse = await queryAgent.processQuery(queryRequest);
      
      allCitations.push(...queryResponse.citations);
      queryResponses.push(queryResponse.content);
    }

    return {
      citations: allCitations,
      queryResponses,
    };
  }

  /**
   * Generate search queries to gather evidence for theory
   */
  private async generateEvidenceQueries(theoryDescription: string): Promise<string[]> {
    const systemPrompt = `You are helping gather evidence for a theory about the visual novel "Higurashi no Naku Koro Ni".

Given a theory description, generate 2-4 specific search queries that would help find supporting or contradicting evidence in the script.

Format your response as a JSON array of strings:
["query 1", "query 2", "query 3"]

Make queries specific and focused on concrete events, dialogue, or character actions.`;

    const userPrompt = `Theory: ${theoryDescription}

Generate search queries to find evidence for or against this theory.`;

    try {
      const command = new ConverseCommand({
        modelId: MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [{ text: userPrompt }],
          },
        ],
        system: [{ text: systemPrompt }],
      });

      const response = await this.bedrockClient.send(command);
      const responseText = response.output?.message?.content?.[0]?.text || '';

      // Parse JSON array
      const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) {
        logger.warn('No JSON found in query generation response');
        return [theoryDescription]; // Fallback to using theory as query
      }

      const queries = JSON.parse(jsonMatch[0]);
      return queries.slice(0, 4); // Limit to 4 queries
    } catch (error) {
      logger.error('Error generating evidence queries', { error });
      return [theoryDescription]; // Fallback
    }
  }

  /**
   * Perform theory analysis using AI
   */
  private async performTheoryAnalysis(
    request: TheoryAgentRequest,
    existingTheory: TheoryProfile | null,
    evidence: GatheredEvidence
  ): Promise<TheoryAnalysisResult> {
    const citationsText = evidence.citations
      .map((c, i) => 
        `[${i}] Episode ${c.episodeName}, Chapter ${c.chapterId}, Message ${c.messageId}${c.speaker ? ` (${c.speaker})` : ''}: ${c.textENG}`
      )
      .join('\n\n');

    const existingTheoryContext = existingTheory
      ? `\nExisting theory status: ${existingTheory.status}
Previous supporting evidence: ${existingTheory.supportingEvidence.length} citations
Previous contradicting evidence: ${existingTheory.contradictingEvidence.length} citations
Previous refinements: ${existingTheory.refinements.length}`
      : '';

    const challengeContext = request.userChallenge
      ? `\n\nUser challenge to previous evidence: ${request.userChallenge}
Re-evaluate the evidence in light of this challenge.`
      : '';

    const systemPrompt = `You are the Theory Agent for CICADA, analyzing theories about "Higurashi no Naku Koro Ni".

Your role is to:
1. Analyze the theory against the provided script evidence
2. Identify supporting evidence (passages that support the theory)
3. Identify contradicting evidence (passages that contradict the theory)
4. Provide a balanced, evidence-based analysis
5. Re-evaluate if the user challenges your previous assessment

Format your response as JSON:
{
  "analysisText": "Your detailed analysis...",
  "supportingCitationIndices": [0, 2, 5],
  "contradictingCitationIndices": [1, 3],
  "confidence": "high|medium|low",
  "reasoning": "Explanation of your assessment..."
}

Be honest about evidence quality. If evidence is weak or ambiguous, say so.${existingTheoryContext}${challengeContext}`;

    const userPrompt = `Theory: ${request.theoryDescription}

Available evidence:
${citationsText}

Analyze this theory against the evidence.`;

    try {
      const command = new ConverseCommand({
        modelId: MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [{ text: userPrompt }],
          },
        ],
        system: [{ text: systemPrompt }],
      });

      const response = await this.bedrockClient.send(command);
      const responseText = response.output?.message?.content?.[0]?.text || '';

      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in analysis response');
      }

      const analysis = JSON.parse(jsonMatch[0]);

      // Map citation indices to actual citations
      const supportingEvidence = (analysis.supportingCitationIndices || [])
        .map((idx: number) => evidence.citations[idx])
        .filter(Boolean);

      const contradictingEvidence = (analysis.contradictingCitationIndices || [])
        .map((idx: number) => evidence.citations[idx])
        .filter(Boolean);

      return {
        analysisText: analysis.analysisText,
        supportingEvidence,
        contradictingEvidence,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
      };
    } catch (error) {
      logger.error('Error performing theory analysis', { error });
      throw error;
    }
  }

  /**
   * Identify profile corrections based on user challenge
   * Property 11: Profile Correction Propagation
   */
  private async identifyProfileCorrections(
    userId: string,
    userChallenge: string,
    evidence: GatheredEvidence
  ): Promise<ProfileCorrection[]> {
    const systemPrompt = `You are identifying profile corrections based on a user's challenge to evidence.

When a user challenges evidence, it may indicate that profile information is incorrect. Analyze the challenge and determine:
1. Which profiles might contain incorrect information
2. What the incorrect information is
3. What the corrected information should be
4. Why the correction is needed

Format your response as JSON array:
[
  {
    "profileType": "CHARACTER|LOCATION|EPISODE|FRAGMENT_GROUP|THEORY",
    "profileId": "profile-id",
    "incorrectInformation": "What was wrong...",
    "correctedInformation": "What it should be...",
    "reasoning": "Why this correction is needed..."
  }
]

Only suggest corrections if the user's challenge clearly indicates an error. Return empty array if no corrections needed.`;

    const userPrompt = `User challenge: ${userChallenge}

Evidence context:
${evidence.queryResponses.join('\n\n')}

Identify any profile corrections needed.`;

    try {
      const command = new ConverseCommand({
        modelId: MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [{ text: userPrompt }],
          },
        ],
        system: [{ text: systemPrompt }],
      });

      const response = await this.bedrockClient.send(command);
      const responseText = response.output?.message?.content?.[0]?.text || '';

      // Parse JSON response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const corrections = JSON.parse(jsonMatch[0]);
      return corrections;
    } catch (error) {
      logger.error('Error identifying profile corrections', { error });
      return [];
    }
  }

  /**
   * Apply a profile correction
   */
  private async applyProfileCorrection(
    userId: string,
    correction: ProfileCorrection
  ): Promise<void> {
    try {
      const profile = await profileService.getProfile(
        userId,
        correction.profileType,
        correction.profileId
      );

      if (!profile) {
        logger.warn('Profile not found for correction', {
          userId,
          profileType: correction.profileType,
          profileId: correction.profileId,
        });
        return;
      }

      // Update profile with correction
      // This is a simplified implementation - in production, you'd want more sophisticated merging
      const updatedProfile = {
        ...profile,
        // Add correction metadata or update specific fields based on profile type
      };

      await profileService.updateProfile(updatedProfile);

      logger.info('Applied profile correction', {
        userId,
        profileType: correction.profileType,
        profileId: correction.profileId,
      });
    } catch (error) {
      logger.error('Error applying profile correction', { error, correction });
    }
  }

  /**
   * Generate theory refinement suggestions
   */
  private async generateRefinements(
    request: TheoryAgentRequest,
    analysis: TheoryAnalysisResult,
    evidence: GatheredEvidence
  ): Promise<TheoryRefinement[]> {
    const systemPrompt = `You are suggesting refinements to a theory about "Higurashi no Naku Koro Ni".

Based on the analysis and evidence, suggest 1-3 ways the theory could be refined to better fit the evidence.

Format your response as JSON array:
[
  {
    "description": "Refined theory description...",
    "reasoning": "Why this refinement improves the theory...",
    "supportingCitationIndices": [0, 2]
  }
]

Refinements should:
- Address contradicting evidence
- Strengthen the theory based on supporting evidence
- Be specific and actionable`;

    const citationsText = evidence.citations
      .map((c, i) => `[${i}] Episode ${c.episodeName}: ${c.textENG.substring(0, 100)}...`)
      .join('\n');

    const userPrompt = `Original theory: ${request.theoryDescription}

Analysis: ${analysis.analysisText}

Supporting evidence: ${analysis.supportingEvidence.length} citations
Contradicting evidence: ${analysis.contradictingEvidence.length} citations

Available citations:
${citationsText}

Suggest refinements to improve this theory.`;

    try {
      const command = new ConverseCommand({
        modelId: MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [{ text: userPrompt }],
          },
        ],
        system: [{ text: systemPrompt }],
      });

      const response = await this.bedrockClient.send(command);
      const responseText = response.output?.message?.content?.[0]?.text || '';

      // Parse JSON response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const refinements = JSON.parse(jsonMatch[0]);

      // Map citation indices to actual citations
      return refinements.map((r: any) => ({
        description: r.description,
        reasoning: r.reasoning,
        supportingCitations: (r.supportingCitationIndices || [])
          .map((idx: number) => evidence.citations[idx])
          .filter(Boolean),
      }));
    } catch (error) {
      logger.error('Error generating refinements', { error });
      return [];
    }
  }

  /**
   * Identify profile updates from new insights
   * Property 13: Profile Update on Insight
   */
  private async identifyProfileUpdates(
    userId: string,
    analysis: TheoryAnalysisResult,
    evidence: GatheredEvidence
  ): Promise<ProfileUpdate[]> {
    const systemPrompt = `You are identifying profile updates based on new insights from theory analysis.

When theory analysis reveals new information about characters, locations, episodes, or connections, identify which profiles should be updated.

Format your response as JSON array:
[
  {
    "profileType": "CHARACTER|LOCATION|EPISODE|FRAGMENT_GROUP",
    "profileId": "profile-id",
    "updateDescription": "What new information should be added..."
  }
]

Only suggest updates for genuinely new insights, not information already in profiles.`;

    const userPrompt = `Analysis: ${analysis.analysisText}

Reasoning: ${analysis.reasoning}

Identify profile updates from this analysis.`;

    try {
      const command = new ConverseCommand({
        modelId: MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [{ text: userPrompt }],
          },
        ],
        system: [{ text: systemPrompt }],
      });

      const response = await this.bedrockClient.send(command);
      const responseText = response.output?.message?.content?.[0]?.text || '';

      // Parse JSON response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const updates = JSON.parse(jsonMatch[0]);
      return updates;
    } catch (error) {
      logger.error('Error identifying profile updates', { error });
      return [];
    }
  }

  /**
   * Update or create theory profile
   */
  private async updateTheoryProfile(
    request: TheoryAgentRequest,
    analysis: TheoryAnalysisResult,
    evidence: GatheredEvidence
  ): Promise<void> {
    if (!request.theoryName) {
      return; // Don't persist if no theory name provided
    }

    const profileId = this.generateProfileId(request.theoryName);
    const existingProfile = await profileService.getProfile(
      request.userId,
      'THEORY',
      profileId
    );

    if (existingProfile && existingProfile.profileType === 'THEORY') {
      // Update existing theory
      const existingTheory = existingProfile as TheoryProfile;
      const updated: TheoryProfile = {
        ...existingTheory,
        description: request.theoryDescription,
        status: this.determineTheoryStatus(analysis),
        supportingEvidence: [
          ...existingTheory.supportingEvidence,
          ...analysis.supportingEvidence,
        ],
        contradictingEvidence: [
          ...existingTheory.contradictingEvidence,
          ...analysis.contradictingEvidence,
        ],
      };

      await profileService.updateProfile(updated);
    } else {
      // Create new theory
      const newTheory: Omit<TheoryProfile, 'version' | 'createdAt' | 'updatedAt'> = {
        userId: request.userId,
        profileId,
        profileType: 'THEORY',
        theoryName: request.theoryName,
        description: request.theoryDescription,
        status: this.determineTheoryStatus(analysis),
        supportingEvidence: analysis.supportingEvidence,
        contradictingEvidence: analysis.contradictingEvidence,
        refinements: [],
        relatedTheories: [],
      };

      await profileService.createProfile(newTheory);
    }
  }

  /**
   * Determine theory status based on analysis
   */
  private determineTheoryStatus(
    analysis: TheoryAnalysisResult
  ): 'proposed' | 'supported' | 'refuted' | 'refined' {
    const supportingCount = analysis.supportingEvidence.length;
    const contradictingCount = analysis.contradictingEvidence.length;

    if (supportingCount === 0 && contradictingCount === 0) {
      return 'proposed';
    }

    if (contradictingCount > supportingCount) {
      return 'refuted';
    }

    if (supportingCount > contradictingCount * 2) {
      return 'supported';
    }

    return 'refined';
  }

  /**
   * Analyze patterns across profiles to suggest theories
   */
  private async analyzeProfilePatterns(
    characterProfiles: any[],
    episodeProfiles: any[],
    locationProfiles: any[],
    episodeContext?: string[]
  ): Promise<TheorySuggestion[]> {
    // Build context from profiles
    const profileSummaries = [
      ...characterProfiles.map(p => `Character ${p.characterName}: ${p.traits.join(', ')}`),
      ...episodeProfiles.map(p => `Episode ${p.episodeName}: ${p.summary}`),
      ...locationProfiles.map(p => `Location ${p.locationName}: ${p.description}`),
    ].join('\n');

    const systemPrompt = `You are suggesting theories about "Higurashi no Naku Koro Ni" based on accumulated profile knowledge.

Analyze the provided profile information and suggest 1-3 theories that:
1. Connect patterns across characters, episodes, or locations
2. Are supported by the profile information
3. Would be interesting to explore further

Format your response as JSON array:
[
  {
    "theoryName": "Brief theory name",
    "description": "Detailed theory description",
    "reasoning": "Why this theory is worth exploring",
    "relevantProfiles": ["CHARACTER#rena", "EPISODE#onikakushi"]
  }
]`;

    const episodeFilter = episodeContext
      ? `\nFocus on these episodes: ${episodeContext.join(', ')}`
      : '';

    const userPrompt = `Profile information:
${profileSummaries}${episodeFilter}

Suggest theories based on patterns in this information.`;

    try {
      const command = new ConverseCommand({
        modelId: MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [{ text: userPrompt }],
          },
        ],
        system: [{ text: systemPrompt }],
      });

      const response = await this.bedrockClient.send(command);
      const responseText = response.output?.message?.content?.[0]?.text || '';

      // Parse JSON response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const suggestions = JSON.parse(jsonMatch[0]);
      return suggestions;
    } catch (error) {
      logger.error('Error analyzing profile patterns', { error });
      return [];
    }
  }

  /**
   * Generate a profile ID from entity name
   */
  private generateProfileId(entityName: string): string {
    return entityName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }
}

// Supporting interfaces
interface GatheredEvidence {
  citations: Citation[];
  queryResponses: string[];
}

interface TheoryAnalysisResult {
  analysisText: string;
  supportingEvidence: Citation[];
  contradictingEvidence: Citation[];
  confidence: string;
  reasoning: string;
}

export interface TheorySuggestion {
  theoryName: string;
  description: string;
  reasoning: string;
  relevantProfiles: string[];
}

// Export singleton instance
export const theoryAgent = new TheoryAgent();
