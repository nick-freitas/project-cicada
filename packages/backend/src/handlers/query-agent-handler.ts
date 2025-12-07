import { Handler } from 'aws-lambda';
import { queryAgent, QueryAgentRequest, QueryAgentResponse } from '../agents/query-agent';
import { logger } from '../utils/logger';

/**
 * Lambda handler for Query Agent
 * Invoked by Orchestrator Agent to perform script search and citation
 */
export const handler: Handler<QueryAgentRequest, QueryAgentResponse> = async (event) => {
  try {
    logger.info('Query Agent handler invoked', {
      userId: event.userId,
      query: event.query?.substring(0, 100),
    });

    // Validate request
    if (!event.query || !event.userId) {
      throw new Error('Missing required fields: query and userId');
    }

    // Process query
    const response = await queryAgent.processQuery(event);

    logger.info('Query Agent handler completed', {
      userId: event.userId,
      citationCount: response.citations.length,
      hasDirectEvidence: response.hasDirectEvidence,
    });

    return response;
  } catch (error) {
    logger.error('Error in Query Agent handler', { error, event });
    throw error;
  }
};
