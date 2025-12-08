# Model Evaluation Framework

This directory contains the evaluation framework for assessing CICADA agent performance using AWS Evals principles.

## Overview

The evaluation framework measures four key dimensions:

1. **Citation Accuracy**: Whether responses include proper citations with complete metadata
2. **Theory Coherence**: Whether theory responses are logical, evidence-based, and coherent
3. **Story Coherence**: Whether responses maintain story consistency and avoid contradictions
4. **Overall Correctness**: General accuracy and appropriateness of responses

## Directory Structure

```
evaluation/
├── datasets/              # Test case datasets
│   ├── citation-accuracy.json
│   ├── theory-coherence.json
│   ├── story-coherence.json
│   └── general-correctness.json
├── metrics/              # Evaluation metrics
│   ├── citation-accuracy.ts
│   ├── theory-coherence.ts
│   ├── story-coherence.ts
│   └── overall-correctness.ts
├── types.ts             # Type definitions
├── evaluator.ts         # Main evaluation orchestrator
├── runner.ts            # Dataset loader and runner
└── README.md
```

## Test Case Format

Each test case follows this structure:

```json
{
  "id": "unique-id",
  "query": "User query to test",
  "context": {
    "userId": "test-user",
    "episodeScope": ["onikakushi"]
  },
  "expectedBehavior": {
    "shouldCite": true,
    "citationCount": 2,
    "episodeReferences": ["onikakushi"],
    "shouldMentionCharacters": ["Rena"],
    "shouldAvoidSpoilers": true
  },
  "metadata": {
    "category": "citation",
    "difficulty": "medium",
    "description": "Test description"
  }
}
```

## Running Evaluations

### Programmatic Usage

```typescript
import { EvaluationRunner } from './runner';

// Create runner
const runner = new EvaluationRunner();

// Define model invocation function
async function invokeModel(query: string, context: any): Promise<string> {
  // Your model invocation logic here
  // This should call your Orchestrator agent
  return response;
}

// Run evaluation
const report = await runner.runEvaluation(
  'anthropic.claude-3-sonnet',
  invokeModel,
  'citation-accuracy.json' // Optional: specific dataset
);

// Save report
runner.saveReport(report, './eval-report.json');
```

### CLI Usage

```bash
# Run all evaluations
pnpm run eval

# Run specific dataset
pnpm run eval:citations
pnpm run eval:theory
pnpm run eval:story
pnpm run eval:general
```

## Metrics

### Citation Accuracy (Requirement 26.2)

Checks:
- Presence of citations when expected
- Citation count meets minimum
- Citations reference correct episodes
- Citations include complete metadata (episode, chapter, speaker)

Scoring:
- 1.0: All checks pass
- 0.0: Missing required citations
- -0.2 per warning (insufficient citations, missing episodes)

### Theory Coherence (Requirement 26.3)

Checks:
- Evidence-based reasoning language
- Logical structure (because, therefore, etc.)
- Supporting citations present
- Appropriate hedging language (might, could, possibly)
- Expected characters mentioned

Scoring:
- 1.0: All checks pass
- 0.3: Coherent but missing citations
- -0.15 per warning

### Story Coherence (Requirement 26.4)

Checks:
- Spoiler awareness (avoids revealing language)
- Episode scope adherence (no out-of-scope citations)
- Expected characters mentioned
- No contradictory statements

Scoring:
- 1.0: All checks pass
- 0.0: Episode scope violations
- -0.2 per warning

### Overall Correctness (Requirement 26.5)

Checks:
- Response length (substantive)
- No hallucination indicators
- Appropriate tone
- Character mention coverage
- Relevance to query

Scoring:
- 1.0: All checks pass
- 0.0: Critical errors (too short, hallucinations)
- -0.15 per warning

## Evaluation Reports

Reports include:

```typescript
{
  runId: string;
  timestamp: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  averageScore: number;
  metricAverages: {
    citationAccuracy: number;
    theoryCoherence: number;
    storyCoherence: number;
    overallCorrectness: number;
  };
  results: EvaluationResult[];
  modelInfo: {
    modelId: string;
  };
}
```

## Adding New Test Cases

1. Choose the appropriate dataset file based on category
2. Add a new test case following the format above
3. Ensure unique ID
4. Set expected behavior based on requirements
5. Run evaluation to verify

## Best Practices

- **Start with easy cases**: Build confidence before tackling hard cases
- **Test edge cases**: Episode boundaries, spoiler handling, missing data
- **Iterate on metrics**: Adjust scoring based on real-world performance
- **Track over time**: Compare reports across model versions
- **Use for model selection**: Compare Nova vs Maverick performance

## Integration with AWS Evals

This framework follows AWS Evals principles:

1. **Automated evaluation**: No manual review required
2. **Reproducible**: Same inputs produce same scores
3. **Comprehensive**: Covers all key quality dimensions
4. **Actionable**: Clear errors and warnings guide improvements
5. **Scalable**: Easy to add new test cases

## Requirements Mapping

- **26.1**: Evaluation framework setup ✓
- **26.2**: Citation accuracy metrics ✓
- **26.3**: Theory coherence metrics ✓
- **26.4**: Story coherence metrics ✓
- **26.5**: Overall correctness metrics ✓
