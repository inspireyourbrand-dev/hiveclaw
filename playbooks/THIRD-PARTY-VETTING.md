# Playbook: Third-Party Vetting and Installation

## Overview
This playbook provides step-by-step instructions for evaluating external skills and plugins before installing them into HiveControl production. Follow this process to ensure security, performance, and architectural alignment.

## Prerequisites
- Access to HiveControl Settings screen
- At least one team member trained in security review
- At least one team member trained in architecture review
- Skill submission form filled out with bottleneck description

## Process Overview

```
Submission → Triage → Security Scan → Architecture Review →
Performance Profile → Redundancy Check → Report → Verdict →
Implementation/Rejection
```

---

## Step 1: Submission and Triage (15 minutes)

### 1.1 Receive Submission
- User/team completes skill submission form with:
  - Skill name and version
  - Short description
  - Bottleneck it solves (quantified if possible)
  - Author/organization info
  - Link to code repository or documentation
  - Any known dependencies

### 1.2 Log Submission
In memory, create entry:
```
vetting:submission:{skill-name}:{timestamp}
{
  "name": "[Skill Name]",
  "version": "[Version]",
  "submitter": "[Name/Org]",
  "bottleneck": "[Problem it solves]",
  "repository": "[URL]",
  "status": "triage",
  "submitted_at": "[ISO-8601]",
  "evaluator_assigned": null
}
```

### 1.3 Assign Evaluator
- Select primary evaluator (typically the most experienced team member available)
- Confirm evaluator can commit 2-4 hours for thorough review
- Note assignment and expected completion date in memory

### 1.4 Check Preliminary Blockers
Before proceeding to full review, verify:
- License is compatible (check LICENSE file in repo)
- Code is accessible and in supported language/format
- No obvious malware or suspicious patterns
- Repository is not abandoned (last commit within 12 months)

**If any blocker found:** Reject at this stage, notify submitter with reason.

---

## Step 2: Security Scan (45 minutes)

### 2.1 Automated Security Scan
Using available security tools (e.g., npm audit, SAST):
- Run against all code files
- Generate dependency vulnerability report
- Flag any known CVEs
- Document findings in memory under `vetting:security-scan:{skill-name}`

### 2.2 Code Review (Manual)
1. **Read README and documentation**
   - Understand purpose, usage, API
   - Note any permissions it requires

2. **Inspect key files in order:**
   - `package.json` / manifest (dependencies, scripts)
   - Main entry point (check imports, initialization)
   - Exported functions/classes (API surface)
   - Any network/API calls (is it calling external services?)
   - File system access (reading, writing, where?)
   - Memory/database access (what does it store?)

3. **Red flags to check:**
   - Eval/exec/dynamic code execution
   - Hardcoded credentials or API keys
   - Suspicious network connections
   - Unusual file system paths
   - Encoding/obfuscation of code
   - Excessive permissions without justification

4. **Document findings:**
   - List all detected permissions (API calls, file access, memory usage, etc.)
   - Score security posture 0-10
   - List any vulnerabilities by severity

### 2.3 Security Reviewer Sign-Off
- Another team member reviews security findings
- Confirm risk assessment and permission list
- Approve to move to next stage or flag for rejection
- Sign off in memory: `vetting:security-review:{skill-name}`

---

## Step 3: Architecture Review (60 minutes)

### 3.1 Compatibility Check
1. **Interface Review**
   - Does it implement HiveControl skill interface?
   - Does it define required exports (init, execute, cleanup)?
   - Are error handling patterns aligned?

2. **Integration Points**
   - How does it interact with memory system?
   - Does it use gateway for communication?
   - Are there assumptions about agent environment?
   - Does it create threads/processes (concurrency model)?

3. **Dependency Analysis**
   - Does it depend on deprecated HiveControl features?
   - Does it require multiple versions of same library?
   - Are external dependencies stable and maintained?

4. **Coupling Assessment**
   - Loose coupling: Operates independently, uses standard APIs ✓
   - Tight coupling: Accesses internals, requires patches to core ✗
   - Score architecture fit: 0-10

### 3.2 Scalability Assessment
1. **Resource Usage**
   - Is it stateless or stateful?
   - If stateful, how much memory does state consume?
   - Are there resource leaks (event listeners, timers, connections)?

2. **Concurrency**
   - Can it run in parallel with other skills?
   - Does it lock shared resources?
   - What's the maximum concurrent execution?

3. **Performance Characteristics**
   - Is the main execution path blocking or async?
   - Are there known slow operations?
   - Does it batch requests or do one-by-one?

### 3.3 Error Handling
- Does it gracefully handle errors?
- Does it crash/exit on errors or recover?
- Does it report errors to memory/dashboard?
- What happens if dependencies fail?

### 3.4 Architecture Sign-Off
- Architecture reviewer assesses fit and scalability
- Score on 0-10 scale
- Identify integration work required (if any)
- Document in memory: `vetting:architecture-review:{skill-name}`

---

## Step 4: Performance Profiling (90 minutes)

### 4.1 Baseline Environment Setup
1. **Isolated test environment:**
   - Spin up test HiveControl instance with no other third-party skills
   - Clear memory cache
   - Single agent process (no concurrency noise)

2. **Capture baseline metrics:**
   - Memory usage (empty): Record in memory
   - CPU usage (idle): Record in memory
   - Gateway latency: Measure baseline ping

### 4.2 Load Test the Skill
1. **Install the skill** in test environment

2. **Run representative workload:**
   - Execute the skill's primary function 10-20 times
   - Measure memory before/after
   - Measure CPU during execution
   - Measure latency of each execution
   - Note any errors or warnings

3. **Stress test (optional but recommended):**
   - If skill is expected to run frequently, run it 100+ times
   - Watch for memory leaks, CPU creep
   - Monitor for any exceptions or degradation

### 4.3 Calculate Impact
```
Memory Overhead = (Memory After - Memory Before) / Memory Before × 100%
CPU Impact = Average CPU % during execution
Latency Impact = Percentile latencies (p50, p95, p99)
Throughput = Executions per minute
```

### 4.4 Document Findings
In memory `vetting:performance:{skill-name}`:
```
{
  "baseline_memory_mb": 150,
  "peak_memory_mb": 180,
  "memory_overhead_percent": 20,
  "cpu_peak_percent": 35,
  "average_execution_ms": 250,
  "p95_execution_ms": 500,
  "p99_execution_ms": 800,
  "throughput_per_min": 240,
  "memory_leak_detected": false,
  "errors_in_100_runs": 0
}
```

---

## Step 5: Redundancy Check (20 minutes)

### 5.1 Inventory Existing Skills
- List all skills currently installed in HiveControl
- For each, note: name, version, primary purpose, performance cost

### 5.2 Compare Functionality
- Does this new skill do something existing skills already do?
- If yes, what's the differentiation?
- Is the new approach superior (faster, more accurate, more flexible)?
- Or is it redundant with marginal benefit?

### 5.3 Score Redundancy Impact
- 0/10: Complete duplicate, no reason to replace existing skill
- 5/10: Overlaps but addresses specific use case
- 10/10: Fills gap, enables new capability not previously possible

### 5.4 Document in Memory
```
vetting:redundancy:{skill-name}
{
  "existing_similar_skills": ["skill-a", "skill-b"],
  "functional_overlap": "60%",
  "differentiation": "faster processing, lower memory",
  "redundancy_score": 7,
  "verdict": "Complements existing skills"
}
```

---

## Step 6: Generate Vetting Report (30 minutes)

### 6.1 Compile All Findings
Gather from memory:
- `vetting:security-scan:{skill-name}`
- `vetting:security-review:{skill-name}`
- `vetting:architecture-review:{skill-name}`
- `vetting:performance:{skill-name}`
- `vetting:redundancy:{skill-name}`

### 6.2 Calculate Weighted Score
Using the scoring rubric:
```
Final Score = (Source Credibility × 0.20)
            + (Security × 0.25)
            + (Architecture × 0.20)
            + (Performance × 0.20)
            + (Redundancy × 0.15)
```

### 6.3 Write Vetting Report
Use the template from the **Third-Party Vetting skill**. Include:
- Executive summary
- All evaluation scores
- Weighted final score
- Clear verdict with justification
- Bottleneck solved (quantified)
- Installation requirements
- Risk assessment
- Monitoring plan
- Sign-offs from security, architecture reviewers

### 6.4 Store Report
Save in memory:
```
vetting:report:{skill-name}:{timestamp}
[Complete report document]
```

---

## Step 7: Issue Verdict (15 minutes)

### 7.1 Determine Verdict
Based on final score:
- **8.0-10.0:** APPROVE
- **6.0-7.9:** SANDBOX TEST
- **4.0-5.9:** REJECT
- **0.0-3.9:** REDUNDANT/UNSAFE

### 7.2 Document Verdict and Conditions
```
vetting:verdict:{skill-name}
{
  "verdict": "APPROVE|SANDBOX_TEST|REJECT|REDUNDANT",
  "score": [final weighted score],
  "conditions": ["condition 1", "condition 2"],
  "approved_by": "[Evaluator Name]",
  "date": "[ISO-8601]",
  "valid_until": "[ISO-8601, 1 year from approval]"
}
```

### 7.3 Notify Submitter
Send communication with:
- Verdict and score
- Summary of findings (2-3 sentences)
- If approved: Installation instructions and monitoring plan
- If rejected: Specific feedback and path to resubmission
- Contact for questions

---

## Step 8: Implementation (for APPROVED or SANDBOX_TEST)

### 8.1 Pre-Installation Checklist
- [ ] Verdict is APPROVE or SANDBOX_TEST
- [ ] All dependencies are available/compatible
- [ ] No other blocking issues identified
- [ ] Installation procedure documented
- [ ] Rollback plan prepared

### 8.2 Install Skill
1. **Upload skill package** to HiveControl via Settings → Manage Skills
2. **Verify installation:** Check Settings → Installed Skills list
3. **Confirm initialization:** Watch for no error messages
4. **Test basic functionality:** Execute once manually, verify output

### 8.3 Enable Monitoring
1. **Create memory entries** for tracking:
   ```
   installed-skills:{skill-name}
   {
     "version": "[Version]",
     "installed_at": "[ISO-8601]",
     "vetting_verdict": "[Verdict]",
     "monitoring_enabled": true,
     "error_threshold": 5,
     "rollback_available_until": "[ISO-8601, 30 days]"
   }
   ```

2. **Add to dashboard** status indicators (if approved)

3. **Set up alerts:**
   - Notify if error rate > 5% in 24h
   - Notify if execution time > 2× baseline
   - Notify if memory > baseline + 50%

### 8.4 For SANDBOX_TEST Only
- Set expiration: 2 weeks from installation
- Set up review meeting 10 days in
- Create decision criteria: Will this be approved for production?
- On expiration: Promote to prod or remove

---

## Step 9: Rollback (if needed)

### 9.1 Automatic Rollback Triggers
- Error rate > 5% sustained over 24h
- Memory leak detected (memory > baseline + 100%)
- Crash/exception on every execution
- Gateway/core system instability traced to skill

### 9.2 Manual Rollback Request
User can request rollback anytime within 30 days of installation:
1. Go to Settings → Installed Skills
2. Find skill, click "Rollback"
3. Confirm: "This will remove the skill and restore previous version"
4. System automatically disables and logs rollback reason

### 9.3 Post-Rollback
- Notify evaluator and vetting team
- Document reason for rollback
- Update verdict record with notes
- Offer path for resubmission if issue can be fixed

---

## Quarterly Review (Annual Process)

Every 90 days, reassess all third-party skills:

1. **Gather metrics** from monitoring:
   - Error rate, latency, memory usage
   - Usage frequency (how often is it used?)
   - ROI vs. cost (did it solve the bottleneck?)

2. **Decide for each skill:**
   - Keep (meeting ROI threshold)
   - Optimize (adjust configuration or usage)
   - Archive (low usage, consider deprecation)
   - Replace (newer alternative found)

3. **Update vetting verdict** with notes and decision

4. **Archive low-ROI skills** (move to disabled if not worth maintaining)

---

## Troubleshooting

### Security Reviewer Finds Vulnerabilities
→ Flag as REJECT or SANDBOX with condition that vulnerability is patched
→ Ask submitter to provide patched version

### Architecture Review Finds Integration Issues
→ Estimate work to integrate (if >16 hours, flag as REJECT or SANDBOX)
→ Offer architecture support if worth pursuing

### Performance Test Shows Unacceptable Overhead
→ Flag as REJECT
→ Provide performance data to submitter
→ Offer to revisit if optimized

### Skill Causes Instability in Production
→ Automatic rollback triggered
→ Investigation into root cause
→ Offer path to resubmission with fixes
→ Escalate to security if malicious suspected
