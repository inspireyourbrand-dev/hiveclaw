# Third-Party Vetting

## Purpose
Third-party vetting evaluates external skills, plugins, and agents before installation into HiveControl. The vetting process ensures security, architecture fit, performance impact, and determines whether a new capability is justified or redundant. The operating model is: one skill per bottleneck, validate thoroughly, keep only proven ROI.

## Evaluation Criteria

### 1. Source Credibility (Weight: 20%)
**Assessment:**
- Author/organization reputation and track record
- Evidence of active maintenance and support
- Community reviews, testimonials, usage metrics
- License compliance and legal standing

**Scoring:**
- Unknown/unverified source: 0/10
- Single author, no history: 3/10
- Reputable author or small org: 6/10
- Established org with proven track record: 9/10
- Official/internal team: 10/10

### 2. Security Posture (Weight: 25%)
**Assessment:**
- Code review findings (malicious code, backdoors, supply chain risks)
- Permissions requested (API keys, memory access, file system access)
- Data handling practices (encryption, logging, retention)
- Known vulnerabilities (CVE, security advisories)
- Third-party dependencies and their security status

**Scoring:**
- Critical vulnerabilities or malicious code: 0/10
- Excessive permissions without justification: 2/10
- Unreviewed code, multiple unpatched deps: 4/10
- Minor security concerns, managed risks: 6/10
- Secure by design, minimal permissions, patched: 9/10
- Security-hardened, audited, best practices: 10/10

### 3. Architecture Fit (Weight: 20%)
**Assessment:**
- Compatibility with HiveControl API contracts
- Integration points and coupling (loose vs. tight)
- Compatibility with existing screens, memory model
- Scalability concerns (threads, resources, blocking operations)
- Error handling and graceful degradation

**Scoring:**
- Incompatible, requires system changes: 0/10
- Loose fit, significant custom integration needed: 4/10
- Good fit, some adapter code needed: 6/10
- Excellent fit, minimal integration work: 8/10
- Seamless integration, extends existing patterns: 10/10

### 4. Performance Impact (Weight: 20%)
**Assessment:**
- CPU and memory overhead (baseline + peak)
- Latency impact on agent execution
- Network bandwidth requirements
- Concurrency constraints (blocking vs. async)
- Cache/optimization opportunities

**Scoring:**
- Severe impact (>50% overhead), blocking operations: 0/10
- Noticeable impact (20-50% overhead): 3/10
- Moderate impact (10-20% overhead): 5/10
- Minimal impact (<10% overhead): 7/10
- Optimized, negligible overhead: 10/10

### 5. Redundancy Check (Weight: 15%)
**Assessment:**
- Does HiveControl already have similar capability?
- Functional overlap with existing skills
- Differentiation vs. built-in alternatives
- Justification for addition (new bottleneck solved vs. marginal improvement)

**Scoring:**
- Complete duplicate of existing skill: 0/10
- Significant overlap, marginal improvement: 2/10
- Some overlap, addresses specific gap: 5/10
- Complements existing skills, no overlap: 8/10
- Solves new bottleneck not previously addressable: 10/10

## Verdict Options

After scoring (0-10 scale in each category), calculate weighted score:
```
Final Score = (Credibility × 0.20) + (Security × 0.25) + (Architecture × 0.20)
              + (Performance × 0.20) + (Redundancy × 0.15)
Range: 0-10
```

### Verdict Mapping

| Final Score | Verdict | Action |
|---|---|---|
| 8.0 - 10.0 | **APPROVE** | Install immediately, monitor for issues |
| 6.0 - 7.9 | **SANDBOX TEST** | Install in isolated test environment first, validate before production |
| 4.0 - 5.9 | **REJECT** | Do not install; recommend addressing specific gaps and resubmitting |
| 0.0 - 3.9 | **REDUNDANT/UNSAFE** | Reject; recommend using existing capability or alternative |

### Conditional Approvals

- **APPROVE with conditions:** If Security gap can be patched before install
- **SANDBOX TEST with timeline:** E.g., "2-week trial, then reassess"
- **REJECT with path forward:** Suggest remediation steps for resubmission

## Operating Model

### Bottleneck-Driven Approach
- Only evaluate third-party skills that solve a documented bottleneck
- Bottleneck: measurable gap in capability or performance not solved by existing skills
- Document: What problem does this solve? Why can't current skills handle it?

### Validation Requirements
- Vetted skill must complete at least one successful task before promotion to prod
- Dashboard alerts on new third-party skills: "Monitoring — 7 days until stable"
- Rollback available for 30 days after install
- Automatic disable if error rate >5% over 24h

### Proven ROI Threshold
- Track: Time saved, error reduction, cost impact
- After 30 days: Assess ROI against criteria (e.g., 15% improvement in agent throughput)
- If not met: Move to disabled/archived
- Review quarterly: Maintain only high-ROI third-party skills

## Vetting Report Template

Use this template for all third-party evaluations:

```markdown
# Third-Party Vetting Report

**Skill/Plugin Name:** [Name]
**Version:** [Version]
**Submitted By:** [Submitter/Organization]
**Date:** [ISO-8601]
**Evaluator:** [Team/Person]

## Executive Summary
[1-2 sentence overview of what this does and recommendation]

## Evaluation Scores

| Category | Score | Notes |
|---|---|---|
| Source Credibility | [0-10] | [Key findings] |
| Security Posture | [0-10] | [Key findings] |
| Architecture Fit | [0-10] | [Key findings] |
| Performance Impact | [0-10] | [Key findings] |
| Redundancy Check | [0-10] | [Key findings] |
| **FINAL WEIGHTED SCORE** | **[0-10]** | |

## Verdict
**APPROVE** / **SANDBOX TEST** / **REJECT** / **REDUNDANT**

## Justification
[Explain the verdict and key decision factors]

## Bottleneck Solved
[What specific problem/gap does this address? Quantify if possible]

## Installation Requirements
- Permissions needed: [list]
- Dependencies: [list]
- Memory footprint: [estimate]
- Estimated latency impact: [ms or percentage]

## Risk Assessment
**Critical Issues:** [List or "None"]
**Medium Issues:** [List or "None"]
**Low Issues:** [List or "None"]

## Conditions for Approval
[If conditional approval, list specific items to resolve]

## Monitoring Plan
- Metrics to track: [List]
- Rollback criteria: [Conditions for auto-disable]
- Review date: [When to reassess]

## Signed Off
- Evaluator: _________________ Date: _______
- Security Review: _________________ Date: _______
- Architecture Review: _________________ Date: _______
```

## Vetting Workflow

1. **Submission:** User/team submits skill with description of bottleneck
2. **Triage:** Assign evaluator, schedule review
3. **Security Scan:** Automated + manual code review
4. **Architecture Review:** Check fit with HiveControl patterns
5. **Performance Profile:** Measure overhead in isolated environment
6. **Redundancy Check:** Verify against existing skills
7. **Report Generation:** Document findings in template
8. **Verdict:** Assign verdict and conditions
9. **Communication:** Notify submitter of decision
10. **Implementation:** Install if approved, set up monitoring

## Appeal Process

If verdict is **REJECT** and submitter wishes to appeal:
1. Provide rebuttal addressing specific feedback
2. Include evidence (benchmarks, usage data, community testimonials)
3. Resubmit for review by different evaluator
4. Final decision by Architecture Review team

## Maintenance

Track all vetted skills in memory:
- `vetting:approved-skills` — production installations
- `vetting:sandbox-skills` — trial installations
- `vetting:rejected-skills` — archive of rejections
- `vetting:reports` — all vetting reports by skill name

Quarterly review: Reassess high-value third-party skills for continued ROI.
