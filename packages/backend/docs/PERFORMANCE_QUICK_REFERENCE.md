# Performance Testing Quick Reference

## Quick Commands

```bash
# Run performance tests
cd packages/backend
export ORCHESTRATOR_AGENT_ID=<your-agent-id>
export ORCHESTRATOR_AGENT_ALIAS_ID=<your-alias-id>
pnpm run perf

# Run optimization analysis
pnpm run optimize
```

## What Gets Measured

### Performance Tests
- ⏱️ Latency (avg, median, P95, P99)
- 🚀 Time to first chunk
- 🎯 Token usage (input, output, total)
- 💰 Cost per 100 queries
- 📊 Success/error rates
- 🔄 Concurrent performance

### Optimization Analysis
- 📝 Verbose phrases
- 🔁 Redundant content
- 📚 Excessive examples
- 🗂️ Complex structure
- 💾 Token savings potential

## Performance Targets

| Metric | Target |
|--------|--------|
| Avg Latency | < 10s |
| P95 Latency | < 20s |
| Time to First Chunk | < 3s |
| Success Rate | > 95% |
| Cost/100 Queries | < $0.10 |
| Monthly Cost | < $100 |

## Budget Breakdown

```
Monthly Budget: $100
├── Agent Costs: ~$0.03 (100 queries)
├── Infrastructure: ~$20
└── Remaining: ~$80
```

## Common Issues

### High Latency
- ✅ Run optimization analysis
- ✅ Reduce context size
- ✅ Check CloudWatch metrics

### High Token Usage
- ✅ Optimize agent instructions
- ✅ Implement context compaction
- ✅ Review agent coordination

### High Error Rate
- ✅ Check CloudWatch logs
- ✅ Review IAM permissions
- ✅ Increase Lambda timeout

## CloudWatch Metrics

```
Namespace: CICADA/Agents

Key Metrics:
- AgentInvocationCount
- AgentInvocationDuration
- AgentTokenUsage
- AgentInvocationErrors
```

## Optimization Tips

1. **Concise Language**: "in order to" → "to"
2. **Remove Redundancy**: Consolidate similar instructions
3. **Limit Examples**: Keep 2-3 most important
4. **Flatten Structure**: Reduce nested bullets
5. **Focus Essentials**: Remove "nice to have" content

## Regular Schedule

- 📅 Weekly: Review CloudWatch metrics
- 📅 Monthly: Run performance tests
- 📅 Quarterly: Run optimization analysis

## More Information

See `performance-testing-guide.md` for complete documentation.
