#!/usr/bin/env ts-node
/**
 * Script to populate the Episode Configuration table with Higurashi episode mappings
 * Run with: ts-node scripts/populate-episode-config.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.EPISODE_CONFIG_TABLE || 'ProjectCICADADataStack-EpisodeConfiguration720ADACC-1G1UFATJMQ6P9';

interface EpisodeConfig {
  episodeId: string;
  episodeName: string;
  filePattern: string;
  arcType: 'question' | 'answer' | 'extra';
  metadata?: Record<string, any>;
}

const episodeConfigs: EpisodeConfig[] = [
  // Question Arcs
  {
    episodeId: 'onikakushi',
    episodeName: 'Onikakushi-hen (Demoned Away)',
    filePattern: 'onikakushi_*',
    arcType: 'question',
    metadata: { arc: 1, order: 1 },
  },
  {
    episodeId: 'watanagashi',
    episodeName: 'Watanagashi-hen (Cotton Drifting)',
    filePattern: 'watanagashi_*',
    arcType: 'question',
    metadata: { arc: 2, order: 2 },
  },
  {
    episodeId: 'tatarigoroshi',
    episodeName: 'Tatarigoroshi-hen (Curse Killing)',
    filePattern: 'tatarigoroshi_*',
    arcType: 'question',
    metadata: { arc: 3, order: 3 },
  },
  {
    episodeId: 'himatsubushi',
    episodeName: 'Himatsubushi-hen (Time Killing)',
    filePattern: 'himatsubushi_*',
    arcType: 'question',
    metadata: { arc: 4, order: 4 },
  },
  
  // Answer Arcs
  {
    episodeId: 'meakashi',
    episodeName: 'Meakashi-hen (Eye Opening)',
    filePattern: 'meakashi_*',
    arcType: 'answer',
    metadata: { arc: 5, order: 5 },
  },
  {
    episodeId: 'tsumihoroboshi',
    episodeName: 'Tsumihoroboshi-hen (Atonement)',
    filePattern: 'tsumihoroboshi_*',
    arcType: 'answer',
    metadata: { arc: 6, order: 6 },
  },
  {
    episodeId: 'minagoroshi',
    episodeName: 'Minagoroshi-hen (Massacre)',
    filePattern: 'minagoroshi_*',
    arcType: 'answer',
    metadata: { arc: 7, order: 7 },
  },
  {
    episodeId: 'matsuribayashi',
    episodeName: 'Matsuribayashi-hen (Festival Accompanying)',
    filePattern: 'matsuribayashi_*',
    arcType: 'answer',
    metadata: { arc: 8, order: 8 },
  },
  
  // Console/Hou Arcs
  {
    episodeId: 'taraimawashi',
    episodeName: 'Taraimawashi-hen (Dice Killing)',
    filePattern: 'taraimawashi_*',
    arcType: 'extra',
    metadata: { console: true },
  },
  {
    episodeId: 'tsukiotoshi',
    episodeName: 'Tsukiotoshi-hen (Moon Crashing)',
    filePattern: 'tsukiotoshi_*',
    arcType: 'extra',
    metadata: { console: true },
  },
  {
    episodeId: 'someutsushi',
    episodeName: 'Someutsushi-hen (Dye Transfer)',
    filePattern: 'someutsushi_*',
    arcType: 'extra',
    metadata: { console: true },
  },
  {
    episodeId: 'kageboushi',
    episodeName: 'Kageboushi-hen (Shadow Silhouette)',
    filePattern: 'kageboushi_*',
    arcType: 'extra',
    metadata: { console: true },
  },
  {
    episodeId: 'tokihogushi',
    episodeName: 'Tokihogushi-hen (Time Unraveling)',
    filePattern: 'tokihogushi_*',
    arcType: 'extra',
    metadata: { console: true },
  },
  {
    episodeId: 'hirukowashi',
    episodeName: 'Hirukowashi-hen (Daybreak)',
    filePattern: 'hirukowashi_*',
    arcType: 'extra',
    metadata: { console: true },
  },
  {
    episodeId: 'kotohogushi',
    episodeName: 'Kotohogushi-hen (Word Unraveling)',
    filePattern: 'kotohogushi_*',
    arcType: 'extra',
    metadata: { console: true },
  },
  {
    episodeId: 'miotsukushi_omote',
    episodeName: 'Miotsukushi-hen Omote (Atonement - Front)',
    filePattern: 'miotsukushi_omote_*',
    arcType: 'extra',
    metadata: { console: true, variant: 'omote' },
  },
  {
    episodeId: 'miotsukushi_ura',
    episodeName: 'Miotsukushi-hen Ura (Atonement - Back)',
    filePattern: 'miotsukushi_ura_*',
    arcType: 'extra',
    metadata: { console: true, variant: 'ura' },
  },
  {
    episodeId: 'outbreak',
    episodeName: 'Outbreak',
    filePattern: 'outbreak_*',
    arcType: 'extra',
    metadata: { console: true },
  },
  {
    episodeId: 'kamikashimashi',
    episodeName: 'Kamikashimashi-hen (God Deceiving)',
    filePattern: 'kamikashimashi_*',
    arcType: 'extra',
    metadata: { console: true },
  },
  {
    episodeId: 'hajisarashi',
    episodeName: 'Hajisarashi-hen (Shame Exposing)',
    filePattern: 'hajisarashi_*',
    arcType: 'extra',
    metadata: { console: true },
  },
  {
    episodeId: 'yoigoshi',
    episodeName: 'Yoigoshi-hen (Night Crossing)',
    filePattern: 'yoigoshi_*',
    arcType: 'extra',
    metadata: { console: true },
  },
  {
    episodeId: 'saikoroshi',
    episodeName: 'Saikoroshi-hen (Dice Killing)',
    filePattern: 'saikoroshi_*',
    arcType: 'extra',
    metadata: { console: true },
  },
  {
    episodeId: 'batsukoishi',
    episodeName: 'Batsukoishi-hen (Punishment Loving)',
    filePattern: 'batsukoishi_*',
    arcType: 'extra',
    metadata: { console: true },
  },
  
  // Common/Shared chapters
  {
    episodeId: 'common',
    episodeName: 'Common Chapters',
    filePattern: 'common_*',
    arcType: 'extra',
    metadata: { shared: true },
  },
  
  // Fragment chapters
  {
    episodeId: 'fragments',
    episodeName: 'Fragment Chapters',
    filePattern: 'fragment_*',
    arcType: 'extra',
    metadata: { fragments: true },
  },
  
  // Tips
  {
    episodeId: 'tips',
    episodeName: 'Tips',
    filePattern: 'tips_*',
    arcType: 'extra',
    metadata: { tips: true },
  },
  
  // Special chapters
  {
    episodeId: 'bus_stop',
    episodeName: 'Bus Stop',
    filePattern: 'bus_stop_*',
    arcType: 'extra',
    metadata: { special: true },
  },
  {
    episodeId: 'everdream',
    episodeName: 'Everdream',
    filePattern: 'everdream_*',
    arcType: 'extra',
    metadata: { special: true },
  },
  {
    episodeId: 'book_prologues',
    episodeName: 'Book Prologues/Epilogues',
    filePattern: 'book_*',
    arcType: 'extra',
    metadata: { special: true },
  },
  {
    episodeId: 'hou_afterparty',
    episodeName: 'Hou Afterparty',
    filePattern: 'hou_afterparty',
    arcType: 'extra',
    metadata: { special: true },
  },
  {
    episodeId: 'chapternames',
    episodeName: 'Chapter Names',
    filePattern: 'chapternames',
    arcType: 'extra',
    metadata: { metadata: true },
  },
];

async function populateEpisodeConfigs() {
  console.log(`Populating Episode Configuration table: ${TABLE_NAME}`);
  console.log(`Total episodes to insert: ${episodeConfigs.length}\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const config of episodeConfigs) {
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: config,
        })
      );
      console.log(`✓ Inserted: ${config.episodeId} - ${config.episodeName}`);
      successCount++;
    } catch (error) {
      console.error(`✗ Failed to insert ${config.episodeId}:`, error);
      errorCount++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total: ${episodeConfigs.length}`);
}

// Run the script
populateEpisodeConfigs()
  .then(() => {
    console.log('\n✓ Episode configuration population complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Failed to populate episode configurations:', error);
    process.exit(1);
  });
