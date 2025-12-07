import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { profileService } from '../services/profile-service';
import {
  Profile,
  CharacterProfile,
  LocationProfile,
  EpisodeProfile,
  FragmentGroupProfile,
  TheoryProfile,
  Citation,
} from '@cicada/shared-types';
import { logger } from '../utils/logger';

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const MODEL_ID = process.env.MODEL_ID || 'amazon.nova-lite-v1:0';

export interface ProfileAgentRequest {
  userId: string;
  conversationContext: string;
  citations?: Citation[];
  extractionMode?: 'auto' | 'explicit';
}

export interface ProfileAgentResponse {
  extractedInformation: ExtractedInformation[];
  updatedProfiles: string[];
  createdProfiles: string[];
}

export interface ExtractedInformation {
  entityType: 'CHARACTER' | 'LOCATION' | 'EPISODE' | 'FRAGMENT_GROUP' | 'THEORY';
  entityName: string;
  information: any;
  citations: Citation[];
}

export interface ProfileRetrievalRequest {
  userId: string;
  profileType?: string;
  profileId?: string;
  entityNames?: string[];
}

export interface ProfileRetrievalResponse {
  profiles: Profile[];
}

/**
 * Profile Agent - Specialized agent for knowledge extraction and profile management
 * 
 * Responsibilities:
 * - Extract character/location/episode information from conversations
 * - Create new profiles automatically
 * - Update existing profiles with new information
 * - Retrieve relevant profile data for queries
 * - Maintain user-specific profile isolation
 */
export class ProfileAgent {
  /**
   * Extract information from conversation and update profiles
   * Property 30: Profile Information Extraction
   */
  async extractAndUpdateProfiles(request: ProfileAgentRequest): Promise<ProfileAgentResponse> {
    try {
      logger.info('Profile Agent extracting information', {
        userId: request.userId,
        contextLength: request.conversationContext.length,
      });

      // Step 1: Extract information from conversation
      const extractedInfo = await this.extractInformation(
        request.conversationContext,
        request.citations || []
      );

      // Step 2: Update or create profiles for each extracted entity
      const updatedProfiles: string[] = [];
      const createdProfiles: string[] = [];

      for (const info of extractedInfo) {
        const profileId = this.generateProfileId(info.entityName);
        const profileKey = `${info.entityType}#${profileId}`;

        // Check if profile exists
        const existingProfile = await profileService.getProfile(
          request.userId,
          info.entityType,
          profileId
        );

        if (existingProfile) {
          // Update existing profile
          // Property 31: Profile Information Updates
          const updatedProfile = await this.updateProfileWithInformation(
            existingProfile,
            info
          );
          await profileService.updateProfile(updatedProfile);
          updatedProfiles.push(profileKey);
        } else {
          // Create new profile
          // Property 29: Profile Auto-Creation
          const newProfile = await this.createProfileFromInformation(
            request.userId,
            info
          );
          await profileService.createProfile(newProfile);
          createdProfiles.push(profileKey);
        }
      }

      logger.info('Profile Agent completed extraction', {
        userId: request.userId,
        extractedCount: extractedInfo.length,
        updatedCount: updatedProfiles.length,
        createdCount: createdProfiles.length,
      });

      return {
        extractedInformation: extractedInfo,
        updatedProfiles,
        createdProfiles,
      };
    } catch (error) {
      logger.error('Error in Profile Agent extraction', { error, userId: request.userId });
      throw error;
    }
  }

  /**
   * Retrieve profiles for context
   * Property 32: Profile Usage in Responses
   */
  async retrieveProfiles(request: ProfileRetrievalRequest): Promise<ProfileRetrievalResponse> {
    try {
      logger.info('Profile Agent retrieving profiles', {
        userId: request.userId,
        profileType: request.profileType,
        profileId: request.profileId,
      });

      let profiles: Profile[] = [];

      if (request.profileId && request.profileType) {
        // Retrieve specific profile
        const profile = await profileService.getProfile(
          request.userId,
          request.profileType,
          request.profileId
        );
        if (profile) {
          profiles = [profile];
        }
      } else if (request.profileType) {
        // Retrieve all profiles of a type
        profiles = await profileService.listProfilesByType(request.userId, request.profileType);
      } else if (request.entityNames && request.entityNames.length > 0) {
        // Retrieve profiles by entity names
        profiles = await this.retrieveProfilesByEntityNames(
          request.userId,
          request.entityNames
        );
      } else {
        // Retrieve all profiles for user
        profiles = await profileService.listProfilesByUser(request.userId);
      }

      logger.info('Profile Agent retrieved profiles', {
        userId: request.userId,
        count: profiles.length,
      });

      return { profiles };
    } catch (error) {
      logger.error('Error in Profile Agent retrieval', { error, userId: request.userId });
      throw error;
    }
  }

  /**
   * Extract information from conversation using AI
   */
  private async extractInformation(
    conversationContext: string,
    citations: Citation[]
  ): Promise<ExtractedInformation[]> {
    const systemPrompt = `You are the Profile Agent for CICADA, responsible for extracting structured information about entities from conversations.

Extract information about the following entity types:
- CHARACTER: People in the story (names, traits, relationships, facts)
- LOCATION: Places in the story (descriptions, significance, appearances)
- EPISODE: Story arcs (summaries, key events, themes)
- FRAGMENT_GROUP: Groups of episodes sharing a timeline
- THEORY: User theories about the story

For each entity mentioned, extract:
1. Entity type
2. Entity name
3. Relevant information (structured based on entity type)
4. Associated citations (if available)

Format your response as JSON array:
[
  {
    "entityType": "CHARACTER",
    "entityName": "Rena",
    "information": {
      "traits": ["kind", "mysterious"],
      "facts": ["lives in Hinamizawa", "has a catchphrase"],
      "relationships": [{"character": "Keiichi", "nature": "friend"}]
    },
    "citationIndices": [0, 1]
  }
]

Only extract information that is explicitly mentioned or strongly implied. Do not speculate.`;

    const citationsText = citations.map((c, i) => 
      `[${i}] Episode ${c.episodeName}, Chapter ${c.chapterId}, Message ${c.messageId}: ${c.textENG}`
    ).join('\n');

    const userPrompt = `Conversation context:
${conversationContext}

Available citations:
${citationsText}

Extract entity information from this conversation.`;

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

      const response = await bedrockClient.send(command);
      const responseText = response.output?.message?.content?.[0]?.text || '';

      // Parse JSON response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn('No JSON found in extraction response');
        return [];
      }

      const extracted = JSON.parse(jsonMatch[0]);

      // Map citation indices to actual citations
      return extracted.map((item: any) => ({
        entityType: item.entityType,
        entityName: item.entityName,
        information: item.information,
        citations: (item.citationIndices || []).map((idx: number) => citations[idx]).filter(Boolean),
      }));
    } catch (error) {
      logger.error('Error extracting information', { error });
      return [];
    }
  }

  /**
   * Update an existing profile with new information
   */
  private async updateProfileWithInformation(
    profile: Profile,
    info: ExtractedInformation
  ): Promise<Profile> {
    switch (profile.profileType) {
      case 'CHARACTER':
        return this.updateCharacterProfile(profile as CharacterProfile, info);
      case 'LOCATION':
        return this.updateLocationProfile(profile as LocationProfile, info);
      case 'EPISODE':
        return this.updateEpisodeProfile(profile as EpisodeProfile, info);
      case 'FRAGMENT_GROUP':
        return this.updateFragmentGroupProfile(profile as FragmentGroupProfile, info);
      case 'THEORY':
        return this.updateTheoryProfile(profile as TheoryProfile, info);
      default:
        const exhaustiveCheck: never = profile;
        throw new Error(`Unknown profile type: ${(exhaustiveCheck as any).profileType}`);
    }
  }

  /**
   * Create a new profile from extracted information
   */
  private async createProfileFromInformation(
    userId: string,
    info: ExtractedInformation
  ): Promise<Omit<Profile, 'version' | 'createdAt' | 'updatedAt'>> {
    const profileId = this.generateProfileId(info.entityName);

    switch (info.entityType) {
      case 'CHARACTER':
        return this.createCharacterProfile(userId, profileId, info);
      case 'LOCATION':
        return this.createLocationProfile(userId, profileId, info);
      case 'EPISODE':
        return this.createEpisodeProfile(userId, profileId, info);
      case 'FRAGMENT_GROUP':
        return this.createFragmentGroupProfile(userId, profileId, info);
      case 'THEORY':
        return this.createTheoryProfile(userId, profileId, info);
      default:
        throw new Error(`Unknown entity type: ${info.entityType}`);
    }
  }

  /**
   * Update character profile with new information
   */
  private updateCharacterProfile(
    profile: CharacterProfile,
    info: ExtractedInformation
  ): CharacterProfile {
    const updated = { ...profile };

    if (info.information.traits) {
      // Add new traits, avoiding duplicates
      const newTraits = info.information.traits.filter(
        (t: string) => !updated.traits.includes(t)
      );
      updated.traits = [...updated.traits, ...newTraits];
    }

    if (info.information.facts) {
      // Add new facts with evidence
      for (const fact of info.information.facts) {
        const existingFact = updated.knownFacts.find(f => f.fact === fact);
        if (existingFact) {
          // Add citations to existing fact
          existingFact.evidence = [...existingFact.evidence, ...info.citations];
        } else {
          // Add new fact
          updated.knownFacts.push({
            fact,
            evidence: info.citations,
          });
        }
      }
    }

    if (info.information.relationships) {
      // Add or update relationships
      for (const rel of info.information.relationships) {
        const existingRel = updated.relationships.find(
          r => r.characterName === rel.character
        );
        if (existingRel) {
          existingRel.nature = rel.nature;
          existingRel.evidence = [...existingRel.evidence, ...info.citations];
        } else {
          updated.relationships.push({
            characterName: rel.character,
            nature: rel.nature,
            evidence: info.citations,
          });
        }
      }
    }

    if (info.information.appearances) {
      // Add episode appearances
      for (const appearance of info.information.appearances) {
        const existingAppearance = updated.appearances.find(
          a => a.episodeId === appearance.episodeId
        );
        if (existingAppearance) {
          existingAppearance.notes += '\n' + appearance.notes;
          existingAppearance.citations = [...existingAppearance.citations, ...info.citations];
        } else {
          updated.appearances.push({
            episodeId: appearance.episodeId,
            notes: appearance.notes,
            citations: info.citations,
          });
        }
      }
    }

    return updated;
  }

  /**
   * Update location profile with new information
   */
  private updateLocationProfile(
    profile: LocationProfile,
    info: ExtractedInformation
  ): LocationProfile {
    const updated = { ...profile };

    if (info.information.description) {
      updated.description = info.information.description;
    }

    if (info.information.significance) {
      updated.significance = info.information.significance;
    }

    if (info.information.appearances) {
      for (const appearance of info.information.appearances) {
        const existingAppearance = updated.appearances.find(
          a => a.episodeId === appearance.episodeId
        );
        if (existingAppearance) {
          existingAppearance.context += '\n' + appearance.context;
          existingAppearance.citations = [...existingAppearance.citations, ...info.citations];
        } else {
          updated.appearances.push({
            episodeId: appearance.episodeId,
            context: appearance.context,
            citations: info.citations,
          });
        }
      }
    }

    return updated;
  }

  /**
   * Update episode profile with new information
   */
  private updateEpisodeProfile(
    profile: EpisodeProfile,
    info: ExtractedInformation
  ): EpisodeProfile {
    const updated = { ...profile };

    if (info.information.summary) {
      updated.summary = info.information.summary;
    }

    if (info.information.keyEvents) {
      for (const event of info.information.keyEvents) {
        const existingEvent = updated.keyEvents.find(e => e.event === event);
        if (!existingEvent) {
          updated.keyEvents.push({
            event,
            citations: info.citations,
          });
        }
      }
    }

    if (info.information.characters) {
      const newCharacters = info.information.characters.filter(
        (c: string) => !updated.characters.includes(c)
      );
      updated.characters = [...updated.characters, ...newCharacters];
    }

    if (info.information.locations) {
      const newLocations = info.information.locations.filter(
        (l: string) => !updated.locations.includes(l)
      );
      updated.locations = [...updated.locations, ...newLocations];
    }

    if (info.information.themes) {
      const newThemes = info.information.themes.filter(
        (t: string) => !updated.themes.includes(t)
      );
      updated.themes = [...updated.themes, ...newThemes];
    }

    return updated;
  }

  /**
   * Update fragment group profile with new information
   */
  private updateFragmentGroupProfile(
    profile: FragmentGroupProfile,
    info: ExtractedInformation
  ): FragmentGroupProfile {
    const updated = { ...profile };

    if (info.information.episodeIds) {
      const newEpisodes = info.information.episodeIds.filter(
        (id: string) => !updated.episodeIds.includes(id)
      );
      updated.episodeIds = [...updated.episodeIds, ...newEpisodes];
    }

    if (info.information.sharedTimeline) {
      updated.sharedTimeline = info.information.sharedTimeline;
    }

    if (info.information.connections) {
      for (const connection of info.information.connections) {
        updated.connections.push({
          description: connection,
          evidence: info.citations,
        });
      }
    }

    if (info.information.divergences) {
      for (const divergence of info.information.divergences) {
        updated.divergences.push({
          description: divergence,
          evidence: info.citations,
        });
      }
    }

    return updated;
  }

  /**
   * Update theory profile with new information
   */
  private updateTheoryProfile(
    profile: TheoryProfile,
    info: ExtractedInformation
  ): TheoryProfile {
    const updated = { ...profile };

    if (info.information.description) {
      updated.description = info.information.description;
    }

    if (info.information.status) {
      updated.status = info.information.status;
    }

    if (info.information.supportingEvidence) {
      updated.supportingEvidence = [...updated.supportingEvidence, ...info.citations];
    }

    if (info.information.contradictingEvidence) {
      updated.contradictingEvidence = [...updated.contradictingEvidence, ...info.citations];
    }

    if (info.information.refinement) {
      updated.refinements.push({
        timestamp: new Date().toISOString(),
        description: info.information.refinement.description,
        reasoning: info.information.refinement.reasoning,
      });
    }

    if (info.information.relatedTheories) {
      const newRelated = info.information.relatedTheories.filter(
        (t: string) => !updated.relatedTheories.includes(t)
      );
      updated.relatedTheories = [...updated.relatedTheories, ...newRelated];
    }

    return updated;
  }

  /**
   * Create a new character profile
   */
  private createCharacterProfile(
    userId: string,
    profileId: string,
    info: ExtractedInformation
  ): Omit<CharacterProfile, 'version' | 'createdAt' | 'updatedAt'> {
    return {
      userId,
      profileId,
      profileType: 'CHARACTER',
      characterName: info.entityName,
      appearances: info.information.appearances || [],
      relationships: (info.information.relationships || []).map((r: any) => ({
        characterName: r.character,
        nature: r.nature,
        evidence: info.citations,
      })),
      traits: info.information.traits || [],
      knownFacts: (info.information.facts || []).map((fact: string) => ({
        fact,
        evidence: info.citations,
      })),
    };
  }

  /**
   * Create a new location profile
   */
  private createLocationProfile(
    userId: string,
    profileId: string,
    info: ExtractedInformation
  ): Omit<LocationProfile, 'version' | 'createdAt' | 'updatedAt'> {
    return {
      userId,
      profileId,
      profileType: 'LOCATION',
      locationName: info.entityName,
      description: info.information.description || '',
      appearances: info.information.appearances || [],
      significance: info.information.significance || '',
    };
  }

  /**
   * Create a new episode profile
   */
  private createEpisodeProfile(
    userId: string,
    profileId: string,
    info: ExtractedInformation
  ): Omit<EpisodeProfile, 'version' | 'createdAt' | 'updatedAt'> {
    return {
      userId,
      profileId,
      profileType: 'EPISODE',
      episodeId: profileId,
      episodeName: info.entityName,
      summary: info.information.summary || '',
      keyEvents: (info.information.keyEvents || []).map((event: string) => ({
        event,
        citations: info.citations,
      })),
      characters: info.information.characters || [],
      locations: info.information.locations || [],
      themes: info.information.themes || [],
    };
  }

  /**
   * Create a new fragment group profile
   */
  private createFragmentGroupProfile(
    userId: string,
    profileId: string,
    info: ExtractedInformation
  ): Omit<FragmentGroupProfile, 'version' | 'createdAt' | 'updatedAt'> {
    return {
      userId,
      profileId,
      profileType: 'FRAGMENT_GROUP',
      groupName: info.entityName,
      episodeIds: info.information.episodeIds || [],
      sharedTimeline: info.information.sharedTimeline || '',
      connections: (info.information.connections || []).map((desc: string) => ({
        description: desc,
        evidence: info.citations,
      })),
      divergences: (info.information.divergences || []).map((desc: string) => ({
        description: desc,
        evidence: info.citations,
      })),
    };
  }

  /**
   * Create a new theory profile
   */
  private createTheoryProfile(
    userId: string,
    profileId: string,
    info: ExtractedInformation
  ): Omit<TheoryProfile, 'version' | 'createdAt' | 'updatedAt'> {
    return {
      userId,
      profileId,
      profileType: 'THEORY',
      theoryName: info.entityName,
      description: info.information.description || '',
      status: info.information.status || 'proposed',
      supportingEvidence: info.citations,
      contradictingEvidence: [],
      refinements: [],
      relatedTheories: info.information.relatedTheories || [],
    };
  }

  /**
   * Generate a profile ID from entity name
   */
  private generateProfileId(entityName: string): string {
    return entityName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  /**
   * Retrieve profiles by entity names
   */
  private async retrieveProfilesByEntityNames(
    userId: string,
    entityNames: string[]
  ): Promise<Profile[]> {
    const profiles: Profile[] = [];

    for (const name of entityNames) {
      const profileId = this.generateProfileId(name);

      // Try each profile type
      for (const type of ['CHARACTER', 'LOCATION', 'EPISODE', 'FRAGMENT_GROUP', 'THEORY']) {
        const profile = await profileService.getProfile(userId, type, profileId);
        if (profile) {
          profiles.push(profile);
          break;
        }
      }
    }

    return profiles;
  }
}

// Export singleton instance
export const profileAgent = new ProfileAgent();
