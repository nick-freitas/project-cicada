import * as fc from 'fast-check';
import { ScriptIngestionService, RawScriptMessage } from '../../src/services/script-ingestion';

/**
 * Feature: project-cicada, Property 1: JSON Parsing Completeness
 * 
 * For any valid script JSON file, when parsed, all required fields 
 * (MessageID, TextJPN, TextENG, type) SHALL be extracted without loss.
 * 
 * Validates: Requirements 1.1
 */

describe('Property 1: JSON Parsing Completeness', () => {
  const service = new ScriptIngestionService();

  // Generator for valid script messages
  const scriptMessageArbitrary = fc.record({
    type: fc.string({ minLength: 1 }),
    MessageID: fc.integer({ min: 0 }),
    TextJPN: fc.string(),
    TextENG: fc.string(),
  });

  it('should extract all required fields from valid JSON without loss', () => {
    fc.assert(
      fc.property(
        fc.array(scriptMessageArbitrary, { minLength: 1, maxLength: 50 }),
        (messages) => {
          // Arrange: Create JSON string from generated messages
          const jsonContent = JSON.stringify(messages);

          // Act: Parse the JSON
          const parsed = service.parseScriptJSON(jsonContent);

          // Assert: All messages should be parsed
          expect(parsed.length).toBe(messages.length);

          // Assert: Each parsed message should have all required fields
          for (let i = 0; i < messages.length; i++) {
            const original = messages[i];
            const parsedMsg = parsed[i];

            expect(parsedMsg.type).toBe(original.type);
            expect(parsedMsg.MessageID).toBe(original.MessageID);
            expect(parsedMsg.TextJPN).toBe(original.TextJPN);
            expect(parsedMsg.TextENG).toBe(original.TextENG);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle JSON with messages wrapped in object', () => {
    fc.assert(
      fc.property(
        fc.array(scriptMessageArbitrary, { minLength: 1, maxLength: 50 }),
        (messages) => {
          // Arrange: Create JSON with messages wrapped in object
          const jsonContent = JSON.stringify({ messages });

          // Act: Parse the JSON
          const parsed = service.parseScriptJSON(jsonContent);

          // Assert: All messages should be parsed
          expect(parsed.length).toBe(messages.length);

          // Assert: Each parsed message should have all required fields
          for (let i = 0; i < messages.length; i++) {
            const original = messages[i];
            const parsedMsg = parsed[i];

            expect(parsedMsg.type).toBe(original.type);
            expect(parsedMsg.MessageID).toBe(original.MessageID);
            expect(parsedMsg.TextJPN).toBe(original.TextJPN);
            expect(parsedMsg.TextENG).toBe(original.TextENG);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should skip invalid messages but preserve valid ones', () => {
    fc.assert(
      fc.property(
        fc.array(scriptMessageArbitrary, { minLength: 1, maxLength: 20 }),
        fc.array(
          fc.oneof(
            // Missing type field
            fc.record({
              MessageID: fc.integer(),
              TextJPN: fc.string(),
              TextENG: fc.string(),
            }),
            // Empty type field
            fc.record({
              type: fc.constant(''),
              MessageID: fc.integer(),
              TextJPN: fc.string(),
              TextENG: fc.string(),
            }),
            // Missing MessageID
            fc.record({
              type: fc.string({ minLength: 1 }),
              TextJPN: fc.string(),
              TextENG: fc.string(),
            }),
            // Wrong type for MessageID
            fc.record({
              type: fc.string({ minLength: 1 }),
              MessageID: fc.string(),
              TextJPN: fc.string(),
              TextENG: fc.string(),
            }),
            // Missing TextJPN
            fc.record({
              type: fc.string({ minLength: 1 }),
              MessageID: fc.integer(),
              TextENG: fc.string(),
            }),
            // Missing TextENG
            fc.record({
              type: fc.string({ minLength: 1 }),
              MessageID: fc.integer(),
              TextJPN: fc.string(),
            })
          ),
          { maxLength: 10 }
        ),
        (validMessages, invalidMessages) => {
          // Arrange: Mix valid and invalid messages
          const allMessages = [...validMessages, ...invalidMessages];
          const jsonContent = JSON.stringify(allMessages);

          // Act: Parse the JSON
          const parsed = service.parseScriptJSON(jsonContent);

          // Assert: Only valid messages should be parsed
          expect(parsed.length).toBe(validMessages.length);

          // Assert: All parsed messages should have required fields
          for (const parsedMsg of parsed) {
            expect(typeof parsedMsg.type).toBe('string');
            expect(parsedMsg.type.length).toBeGreaterThan(0);
            expect(typeof parsedMsg.MessageID).toBe('number');
            expect(typeof parsedMsg.TextJPN).toBe('string');
            expect(typeof parsedMsg.TextENG).toBe('string');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve exact field values without modification', () => {
    fc.assert(
      fc.property(
        fc.array(scriptMessageArbitrary, { minLength: 1, maxLength: 50 }),
        (messages) => {
          // Arrange
          const jsonContent = JSON.stringify(messages);

          // Act
          const parsed = service.parseScriptJSON(jsonContent);

          // Assert: Round trip - parsed data should match original
          for (let i = 0; i < messages.length; i++) {
            const original = messages[i];
            const parsedMsg = parsed[i];

            // Exact equality for all fields
            expect(parsedMsg).toEqual({
              type: original.type,
              MessageID: original.MessageID,
              TextJPN: original.TextJPN,
              TextENG: original.TextENG,
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
