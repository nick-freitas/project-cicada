export interface Citation {
  episodeId: string;
  episodeName: string;
  chapterId: string;
  messageId: number;
  speaker?: string;
  textENG: string;
  textJPN?: string;
  nuance?: string;
}

export enum ProfileType {
  CHARACTER = 'CHARACTER',
  LOCATION = 'LOCATION',
  EPISODE = 'EPISODE',
  FRAGMENT_GROUP = 'FRAGMENT_GROUP',
  THEORY = 'THEORY',
}

export interface BaseProfile {
  profileId: string;
  profileType: 'CHARACTER' | 'LOCATION' | 'EPISODE' | 'FRAGMENT_GROUP' | 'THEORY';
  userId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterProfile extends BaseProfile {
  profileType: 'CHARACTER';
  characterName: string;
  appearances: {
    episodeId: string;
    notes: string;
    citations: Citation[];
  }[];
  relationships: {
    characterName: string;
    nature: string;
    evidence: Citation[];
  }[];
  traits: string[];
  knownFacts: {
    fact: string;
    evidence: Citation[];
  }[];
}

export interface LocationProfile extends BaseProfile {
  profileType: 'LOCATION';
  locationName: string;
  description: string;
  appearances: {
    episodeId: string;
    context: string;
    citations: Citation[];
  }[];
  significance: string;
}

export interface EpisodeProfile extends BaseProfile {
  profileType: 'EPISODE';
  episodeId: string;
  episodeName: string;
  summary: string;
  keyEvents: {
    event: string;
    citations: Citation[];
  }[];
  characters: string[];
  locations: string[];
  themes: string[];
}

export interface FragmentGroupProfile extends BaseProfile {
  profileType: 'FRAGMENT_GROUP';
  groupName: string;
  episodeIds: string[];
  sharedTimeline: string;
  connections: {
    description: string;
    evidence: Citation[];
  }[];
  divergences: {
    description: string;
    evidence: Citation[];
  }[];
}

export interface TheoryProfile extends BaseProfile {
  profileType: 'THEORY';
  theoryName: string;
  description: string;
  status: 'proposed' | 'supported' | 'refuted' | 'refined';
  supportingEvidence: Citation[];
  contradictingEvidence: Citation[];
  refinements: {
    timestamp: string;
    description: string;
    reasoning: string;
  }[];
  relatedTheories: string[];
}

export type Profile =
  | CharacterProfile
  | LocationProfile
  | EpisodeProfile
  | FragmentGroupProfile
  | TheoryProfile;
