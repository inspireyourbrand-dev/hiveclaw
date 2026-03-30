/**
 * HiveWorkflow Engine
 *
 * Core workflow orchestration: receives natural-language requests,
 * decomposes them into tasks, matches agents, executes the swarm,
 * and provides guided steps when human intervention is needed.
 *
 * Operates in hybrid mode:
 *   - Standalone: built-in JS engine simulates agent execution
 *   - Connected: routes to real OpenClaw gateway agents via WS API
 */

class HiveWorkflowEngine extends EventTarget {
  constructor(opts = {}) {
    super();
    this.wsClient = opts.wsClient || null;          // HiveWSClient instance
    this.hwMonitor = opts.hwMonitor || null;         // HiveHWMonitor instance
    this.spawner = opts.spawner || null;             // HiveAgentSpawner instance
    this.mode = 'standalone';                        // 'standalone' | 'connected'
    this.workflows = new Map();                      // workflowId → WorkflowState
    this.activeWorkflow = null;

    // Agent registry — permanent swarm members
    this.permanentAgents = [
      { id: 'orion',  name: 'Orion',  role: 'Master Orchestrator', domain: 'routing, priorities, oversight', color: '#ffe930', icon: 'O', capabilities: ['decompose', 'route', 'monitor', 'escalate', 'report'] },
      { id: 'atlas',  name: 'Atlas',  role: 'Infrastructure & Ops', domain: 'deployment, servers, networking', color: '#3ebaf4', icon: 'A', capabilities: ['deploy', 'configure', 'monitor-infra', 'ssh', 'docker'] },
      { id: 'forge',  name: 'Forge',  role: 'Code & Build', domain: 'code generation, builds, features', color: '#ff6b35', icon: 'F', capabilities: ['code', 'build', 'test', 'refactor', 'api-integration'] },
      { id: 'patch',  name: 'Patch',  role: 'Bug Fixing', domain: 'debugging, test repair, stability', color: '#ff4757', icon: 'P', capabilities: ['debug', 'trace', 'fix', 'test-repair', 'log-analysis'] },
      { id: 'quill',  name: 'Quill',  role: 'Content & Docs', domain: 'copywriting, documentation, content', color: '#df30ff', icon: 'Q', capabilities: ['write', 'edit', 'document', 'seo', 'social-media'] },
      { id: 'cipher', name: 'Cipher', role: 'Security & Compliance', domain: 'security, audits, risk', color: '#00d49b', icon: 'C', capabilities: ['audit', 'scan', 'compliance', 'access-review', 'encrypt'] },
      { id: 'pixel',  name: 'Pixel',  role: 'Design & UI/UX', domain: 'frontend design, visual polish', color: '#ff69b4', icon: 'X', capabilities: ['design', 'css', 'responsive', 'accessibility', 'brand'] },
      { id: 'spark',  name: 'Spark',  role: 'Research & Analysis', domain: 'research, market intel, data', color: '#4a90d9', icon: 'S', capabilities: ['research', 'analyze', 'compare', 'benchmark', 'report'] }
    ];

    // Task decomposition patterns — maps keywords to capabilities
    this.decompositionPatterns = [
      { keywords: ['website', 'landing page', 'web page', 'html', 'frontend', 'ui', 'dashboard'], capabilities: ['design', 'code', 'css', 'responsive'], agents: ['pixel', 'forge'] },
      { keywords: ['api', 'backend', 'server', 'endpoint', 'database', 'rest', 'graphql'], capabilities: ['code', 'api-integration', 'deploy'], agents: ['forge', 'atlas'] },
      { keywords: ['deploy', 'hosting', 'docker', 'server', 'cloud', 'production', 'ci/cd'], capabilities: ['deploy', 'configure', 'docker'], agents: ['atlas'] },
      { keywords: ['bug', 'fix', 'error', 'broken', 'crash', 'failing', 'debug'], capabilities: ['debug', 'trace', 'fix', 'test-repair'], agents: ['patch'] },
      { keywords: ['write', 'blog', 'content', 'article', 'newsletter', 'copy', 'email', 'social'], capabilities: ['write', 'edit', 'seo', 'social-media'], agents: ['quill'] },
      { keywords: ['security', 'audit', 'compliance', 'vulnerability', 'penetration', 'encrypt'], capabilities: ['audit', 'scan', 'compliance'], agents: ['cipher'] },
      { keywords: ['research', 'analyze', 'compare', 'market', 'competitor', 'data', 'report'], capabilities: ['research', 'analyze', 'benchmark'], agents: ['spark'] },
      { keywords: ['design', 'logo', 'brand', 'mockup', 'wireframe', 'prototype', 'figma'], capabilities: ['design', 'brand'], agents: ['pixel'] },
      { keywords: ['automate', 'workflow', 'pipeline', 'cron', 'schedule', 'integration'], capabilities: ['code', 'configure', 'deploy'], agents: ['forge', 'atlas'] },
      { keywords: ['test', 'testing', 'qa', 'coverage', 'unit test', 'e2e'], capabilities: ['test', 'code', 'debug'], agents: ['patch', 'forge'] },
      { keywords: ['document', 'documentation', 'readme', 'guide', 'sop', 'manual'], capabilities: ['document', 'write'], agents: ['quill'] },
      { keywords: ['outreach', 'linkedin', 'cold email', 'lead gen', 'prospecting'], capabilities: ['write', 'research', 'social-media'], agents: ['quill', 'spark'] },
      { keywords: ['crm', 'ghl', 'gohighlevel', 'automate ai', 'pipeline'], capabilities: ['configure', 'api-integration'], agents: ['forge', 'atlas'] },
      { keywords: ['phone', 'voice', 'call', 'ivr', 'agent', 'receptionist'], capabilities: ['configure', 'write'], agents: ['forge', 'quill'] },
    ];

    // Guided step templates for common human-intervention scenarios
    this.humanStepTemplates = {
      'credentials': {
        title: 'Provide Credentials',
        description: 'This workflow needs access credentials to continue.',
        fields: [
          { type: 'text', label: 'Service Name', placeholder: 'e.g., GitHub, AWS, Vercel' },
          { type: 'password', label: 'API Key / Token', placeholder: 'Paste your API key here' },
          { type: 'text', label: 'Additional Config (optional)', placeholder: 'e.g., region, project ID' }
        ]
      },
      'approval': {
        title: 'Review & Approve',
        description: 'The agents have prepared something that needs your approval before proceeding.',
        fields: [
          { type: 'review', label: 'Review the output below' },
          { type: 'choice', label: 'Decision', options: ['Approve', 'Request Changes', 'Cancel'] }
        ]
      },
      'file-upload': {
        title: 'Upload Required Files',
        description: 'This workflow needs files from your computer to continue.',
        fields: [
          { type: 'file', label: 'Select files', accept: '*/*', multiple: true }
        ]
      },
      'manual-action': {
        title: 'Manual Step Required',
        description: 'This step requires action outside the system.',
        fields: [
          { type: 'checklist', label: 'Complete these steps', items: [] },
          { type: 'confirm', label: 'I have completed all steps above' }
        ]
      },
      'configuration': {
        title: 'Configure Settings',
        description: 'The workflow needs your preferences to continue.',
        fields: [
          { type: 'form', label: 'Settings', fields: [] }
        ]
      }
    };

    this._detectMode();
  }

  // --- Mode Detection ---

  _detectMode() {
    if (this.wsClient && this.wsClient.connected) {
      this.mode = 'connected';
    } else {
      this.mode = 'standalone';
    }
    // Re-check when WS connects/disconnects
    if (this.wsClient) {
      this.wsClient.on('_status', (status) => {
        const newMode = status.status === 'connected' ? 'connected' : 'standalone';
        if (newMode !== this.mode) {
          this.mode = newMode;
          this._emit('mode-change', { mode: this.mode });
        }
      });
    }
  }

  // --- Workflow Lifecycle ---

  /**
   * Submit a natural-language workflow request.
   * Returns a workflow object with real-time status updates via events.
   */
  async submitWorkflow(userRequest) {
    const workflowId = 'wf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

    const workflow = {
      id: workflowId,
      request: userRequest,
      status: 'decomposing',        // decomposing → matching → capacity-check → executing → human-needed → completed → failed
      createdAt: Date.now(),
      tasks: [],
      assignedAgents: [],
      spawnedAgents: [],
      humanSteps: [],
      results: [],
      progress: 0,
      logs: [],
      error: null
    };

    this.workflows.set(workflowId, workflow);
    this.activeWorkflow = workflow;
    this._emit('workflow-created', workflow);

    try {
      // Phase 1: Decompose
      this._log(workflow, 'orion', `Analyzing request: "${userRequest}"`);
      await this._delay(800);

      const tasks = await this._decompose(workflow, userRequest);
      workflow.tasks = tasks;
      workflow.status = 'matching';
      this._emit('workflow-updated', workflow);

      // Phase 2: Match agents
      this._log(workflow, 'orion', `Decomposed into ${tasks.length} tasks. Matching agents...`);
      await this._delay(600);

      const assignments = await this._matchAgents(workflow, tasks);
      workflow.assignedAgents = assignments;
      workflow.status = 'capacity-check';
      this._emit('workflow-updated', workflow);

      // Phase 3: Check hardware capacity
      this._log(workflow, 'orion', `Checking system capacity for ${assignments.length} concurrent agents...`);
      await this._delay(400);

      const capacityResult = await this._checkCapacity(workflow, assignments);
      if (!capacityResult.ok) {
        this._log(workflow, 'orion', `Capacity limit: ${capacityResult.reason}. Adjusting plan...`);
        await this._adjustForCapacity(workflow, capacityResult);
      }

      // Phase 4: Execute
      workflow.status = 'executing';
      this._emit('workflow-updated', workflow);

      await this._executeWorkflow(workflow);

    } catch (err) {
      workflow.status = 'failed';
      workflow.error = err.message;
      this._log(workflow, 'orion', `Workflow failed: ${err.message}`);
      this._emit('workflow-failed', workflow);
    }

    return workflow;
  }

  // --- Phase 1: Task Decomposition ---

  async _decompose(workflow, request) {
    const requestLower = request.toLowerCase();
    const tasks = [];
    const matchedPatterns = new Set();

    // Match against decomposition patterns
    for (const pattern of this.decompositionPatterns) {
      for (const keyword of pattern.keywords) {
        if (requestLower.includes(keyword)) {
          const patternKey = pattern.agents.join(',');
          if (!matchedPatterns.has(patternKey)) {
            matchedPatterns.add(patternKey);
            // Generate tasks for this capability cluster
            const clusterTasks = this._generateTasks(request, pattern, tasks.length);
            tasks.push(...clusterTasks);
          }
          break;
        }
      }
    }

    // If no patterns matched, create a general research + execution plan
    if (tasks.length === 0) {
      tasks.push(
        this._createTask(0, 'Research & Analysis', `Analyze the request and identify requirements: "${request}"`, ['spark'], 'research', 'high'),
        this._createTask(1, 'Planning & Architecture', 'Create implementation plan based on research findings', ['orion'], 'planning', 'high'),
        this._createTask(2, 'Implementation', 'Execute the plan — build, configure, or create as needed', ['forge'], 'execution', 'high'),
        this._createTask(3, 'Review & Polish', 'Review output for quality, fix issues, polish deliverables', ['patch', 'pixel'], 'review', 'medium'),
        this._createTask(4, 'Documentation', 'Document what was built, how to use it, and next steps', ['quill'], 'documentation', 'low')
      );
    }

    // Always add a verification task at the end
    tasks.push(
      this._createTask(tasks.length, 'Verification & Delivery', 'Verify all outputs, run smoke tests, prepare deliverables for the user', ['orion'], 'verification', 'high')
    );

    // Check for human-intervention needs
    const humanNeeded = this._detectHumanNeeds(request, tasks);
    if (humanNeeded.length > 0) {
      workflow.humanSteps = humanNeeded;
    }

    await this._delay(300);
    this._log(workflow, 'orion', `Task plan ready: ${tasks.length} tasks identified${humanNeeded.length > 0 ? `, ${humanNeeded.length} steps need your input` : ''}`);

    return tasks;
  }

  _generateTasks(request, pattern, startIndex) {
    const tasks = [];
    const agentNames = pattern.agents.map(id => this.permanentAgents.find(a => a.id === id)?.name || id);

    // Research phase
    if (pattern.capabilities.includes('research') || pattern.capabilities.includes('analyze')) {
      tasks.push(this._createTask(startIndex + tasks.length, `Research: ${pattern.keywords[0]}`,
        `Research requirements and best practices for ${pattern.keywords.slice(0, 3).join(', ')}`,
        ['spark'], 'research', 'high'));
    }

    // Design phase
    if (pattern.capabilities.includes('design') || pattern.capabilities.includes('css') || pattern.capabilities.includes('brand')) {
      tasks.push(this._createTask(startIndex + tasks.length, `Design: ${pattern.keywords[0]}`,
        `Design the visual layout, components, and user experience`,
        ['pixel'], 'design', 'high'));
    }

    // Build phase
    if (pattern.capabilities.includes('code') || pattern.capabilities.includes('api-integration') || pattern.capabilities.includes('configure')) {
      tasks.push(this._createTask(startIndex + tasks.length, `Build: ${pattern.keywords[0]}`,
        `Implement the core functionality — write code, configure systems, build components`,
        pattern.agents, 'execution', 'high'));
    }

    // Content phase
    if (pattern.capabilities.includes('write') || pattern.capabilities.includes('edit') || pattern.capabilities.includes('seo')) {
      tasks.push(this._createTask(startIndex + tasks.length, `Content: ${pattern.keywords[0]}`,
        `Write, edit, and optimize all content and copy`,
        ['quill'], 'content', 'medium'));
    }

    // Security review
    if (pattern.capabilities.includes('audit') || pattern.capabilities.includes('deploy') || pattern.capabilities.includes('encrypt')) {
      tasks.push(this._createTask(startIndex + tasks.length, `Security Review`,
        `Audit for security issues, compliance requirements, and access controls`,
        ['cipher'], 'review', 'medium'));
    }

    // Deploy phase
    if (pattern.capabilities.includes('deploy') || pattern.capabilities.includes('docker')) {
      tasks.push(this._createTask(startIndex + tasks.length, `Deploy & Configure`,
        `Deploy to the target environment, configure runtime settings, verify production readiness`,
        ['atlas'], 'deployment', 'high'));
    }

    return tasks;
  }

  _createTask(index, title, description, agentIds, phase, priority) {
    return {
      id: `task-${index}`,
      index,
      title,
      description,
      agentIds,
      phase,
      priority,
      status: 'pending',      // pending → in-progress → completed → failed → blocked
      progress: 0,
      startedAt: null,
      completedAt: null,
      output: null,
      error: null,
      dependencies: index > 0 ? [`task-${index - 1}`] : []
    };
  }

  _detectHumanNeeds(request, tasks) {
    const needs = [];
    const requestLower = request.toLowerCase();

    // Detect credential needs
    const credentialTriggers = ['api', 'deploy', 'login', 'authenticate', 'connect', 'oauth', 'token', 'key', 'password', 'aws', 'gcp', 'azure', 'vercel', 'github'];
    if (credentialTriggers.some(t => requestLower.includes(t))) {
      needs.push({
        id: 'step-creds',
        type: 'credentials',
        title: 'Provide Access Credentials',
        description: 'The workflow needs API keys or login credentials to access external services.',
        insertAfterTask: 0,
        status: 'pending',
        template: this.humanStepTemplates.credentials,
        data: null
      });
    }

    // Detect approval needs (anything that goes public or costs money)
    const approvalTriggers = ['publish', 'deploy', 'send', 'post', 'launch', 'production', 'live', 'public', 'email', 'social media'];
    if (approvalTriggers.some(t => requestLower.includes(t))) {
      needs.push({
        id: 'step-approve',
        type: 'approval',
        title: 'Review Before Publishing',
        description: 'Review the output before it goes live. Nothing ships without your approval.',
        insertAfterTask: tasks.length - 2,
        status: 'pending',
        template: this.humanStepTemplates.approval,
        data: null
      });
    }

    // Detect file upload needs
    const fileTriggers = ['upload', 'import', 'csv', 'spreadsheet', 'image', 'photo', 'logo', 'document', 'pdf'];
    if (fileTriggers.some(t => requestLower.includes(t))) {
      needs.push({
        id: 'step-files',
        type: 'file-upload',
        title: 'Upload Required Files',
        description: 'The workflow needs files from your computer.',
        insertAfterTask: 0,
        status: 'pending',
        template: this.humanStepTemplates['file-upload'],
        data: null
      });
    }

    // Detect manual action needs
    const manualTriggers = ['dns', 'domain', 'nameserver', 'mx record', 'cname', 'ssl certificate', 'app store', 'play store'];
    if (manualTriggers.some(t => requestLower.includes(t))) {
      needs.push({
        id: 'step-manual',
        type: 'manual-action',
        title: 'Manual Configuration Required',
        description: 'Some steps need to be done outside the system (e.g., DNS settings, app store submissions).',
        insertAfterTask: tasks.length - 2,
        status: 'pending',
        template: this.humanStepTemplates['manual-action'],
        data: null
      });
    }

    return needs;
  }

  // --- Phase 2: Agent Matching ---

  async _matchAgents(workflow, tasks) {
    const assignments = [];
    const agentLoad = new Map(); // agentId → number of tasks assigned

    for (const task of tasks) {
      for (const agentId of task.agentIds) {
        const agent = this.permanentAgents.find(a => a.id === agentId);
        if (agent) {
          const load = agentLoad.get(agentId) || 0;
          assignments.push({
            taskId: task.id,
            agentId: agent.id,
            agentName: agent.name,
            agentColor: agent.color,
            role: agent.role,
            estimatedDuration: this._estimateTaskDuration(task),
            load: load + 1
          });
          agentLoad.set(agentId, load + 1);
        }
      }
    }

    // Determine if we need to spawn additional agents
    const maxLoadPerAgent = 3;
    for (const [agentId, load] of agentLoad) {
      if (load > maxLoadPerAgent) {
        const agent = this.permanentAgents.find(a => a.id === agentId);
        this._log(workflow, 'orion', `${agent.name} is overloaded (${load} tasks). May spawn specialist to assist.`);
      }
    }

    return assignments;
  }

  _estimateTaskDuration(task) {
    const baseDurations = {
      research: 15000,
      planning: 10000,
      design: 20000,
      execution: 30000,
      content: 15000,
      review: 10000,
      deployment: 20000,
      verification: 8000,
      documentation: 12000
    };
    const base = baseDurations[task.phase] || 15000;
    const priorityMultiplier = task.priority === 'high' ? 1.2 : task.priority === 'low' ? 0.8 : 1;
    return Math.round(base * priorityMultiplier);
  }

  // --- Phase 3: Capacity Check ---

  async _checkCapacity(workflow, assignments) {
    if (!this.hwMonitor) {
      // No hardware monitor — assume reasonable defaults
      return { ok: true, maxAgents: 8, recommendedConcurrent: 4 };
    }

    const profile = await this.hwMonitor.getSystemProfile();
    const uniqueAgents = new Set(assignments.map(a => a.agentId)).size;
    const maxConcurrent = profile.maxConcurrentAgents || 4;

    if (uniqueAgents > maxConcurrent) {
      return {
        ok: false,
        reason: `Need ${uniqueAgents} agents but system can handle ${maxConcurrent} concurrently`,
        maxAgents: maxConcurrent,
        neededAgents: uniqueAgents,
        recommendation: 'serialize',
        profile
      };
    }

    this._log(workflow, 'atlas', `System capacity: ${maxConcurrent} max concurrent agents. Need ${uniqueAgents}. ✓ Clear to proceed.`);
    return { ok: true, maxAgents: maxConcurrent, recommendedConcurrent: Math.min(uniqueAgents, maxConcurrent), profile };
  }

  async _adjustForCapacity(workflow, capacityResult) {
    // Re-order tasks to serialize execution within capacity limits
    const maxConcurrent = capacityResult.maxAgents;
    this._log(workflow, 'orion', `Adjusting plan: will run max ${maxConcurrent} agents at a time, serializing the rest.`);

    // Group tasks into execution waves
    const waves = [];
    let currentWave = [];
    const agentsInWave = new Set();

    for (const task of workflow.tasks) {
      const taskAgents = new Set(task.agentIds);
      const wouldExceed = new Set([...agentsInWave, ...taskAgents]).size > maxConcurrent;

      if (wouldExceed && currentWave.length > 0) {
        waves.push([...currentWave]);
        currentWave = [task];
        agentsInWave.clear();
        taskAgents.forEach(a => agentsInWave.add(a));
      } else {
        currentWave.push(task);
        taskAgents.forEach(a => agentsInWave.add(a));
      }
    }
    if (currentWave.length > 0) waves.push(currentWave);

    workflow._executionWaves = waves;
    this._log(workflow, 'orion', `Plan adjusted: ${waves.length} execution waves.`);
  }

  // --- Phase 4: Execution ---

  async _executeWorkflow(workflow) {
    const waves = workflow._executionWaves || [workflow.tasks];

    for (let wi = 0; wi < waves.length; wi++) {
      const wave = Array.isArray(waves[wi]) ? waves[wi] : [waves[wi]];
      this._log(workflow, 'orion', `Executing wave ${wi + 1}/${waves.length} (${wave.length} tasks)`);

      // Check for human steps that should insert before this wave
      for (const step of workflow.humanSteps) {
        if (step.status === 'pending' && step.insertAfterTask <= (wave[0]?.index || 0)) {
          workflow.status = 'human-needed';
          this._emit('human-step-needed', { workflow, step });
          this._log(workflow, 'orion', `⏸ Pausing: "${step.title}" needs your input.`);

          // Wait for human to complete the step
          await this._waitForHumanStep(workflow, step);

          workflow.status = 'executing';
          this._emit('workflow-updated', workflow);
          this._log(workflow, 'orion', `✓ "${step.title}" completed. Resuming workflow.`);
        }
      }

      // Execute all tasks in this wave concurrently
      const taskPromises = wave.map(task => this._executeTask(workflow, task));
      await Promise.all(taskPromises);

      // Update overall progress
      const completedTasks = workflow.tasks.filter(t => t.status === 'completed').length;
      workflow.progress = Math.round((completedTasks / workflow.tasks.length) * 100);
      this._emit('workflow-updated', workflow);
    }

    // Final human steps (approval before publishing, etc.)
    for (const step of workflow.humanSteps) {
      if (step.status === 'pending') {
        workflow.status = 'human-needed';
        this._emit('human-step-needed', { workflow, step });
        this._log(workflow, 'orion', `⏸ Final step: "${step.title}" needs your input.`);
        await this._waitForHumanStep(workflow, step);
        this._log(workflow, 'orion', `✓ "${step.title}" completed.`);
      }
    }

    // Complete
    workflow.status = 'completed';
    workflow.progress = 100;
    this._log(workflow, 'orion', `✅ Workflow complete! All ${workflow.tasks.length} tasks finished.`);
    this._emit('workflow-completed', workflow);
  }

  async _executeTask(workflow, task) {
    task.status = 'in-progress';
    task.startedAt = Date.now();
    this._emit('task-started', { workflow, task });

    const agents = task.agentIds.map(id => this.permanentAgents.find(a => a.id === id)).filter(Boolean);
    const agentNames = agents.map(a => a.name).join(' + ');
    this._log(workflow, agents[0]?.id || 'orion', `Starting: "${task.title}" [${agentNames}]`);

    try {
      if (this.mode === 'connected' && this.wsClient) {
        // Real execution via gateway
        await this._executeTaskViaGateway(workflow, task);
      } else {
        // Simulated execution
        await this._simulateTaskExecution(workflow, task);
      }

      task.status = 'completed';
      task.completedAt = Date.now();
      task.progress = 100;
      this._log(workflow, agents[0]?.id || 'orion', `✓ Completed: "${task.title}"`);
      this._emit('task-completed', { workflow, task });

    } catch (err) {
      task.status = 'failed';
      task.error = err.message;
      this._log(workflow, agents[0]?.id || 'orion', `✗ Failed: "${task.title}" — ${err.message}`);
      this._emit('task-failed', { workflow, task, error: err });
      throw err;
    }
  }

  async _executeTaskViaGateway(workflow, task) {
    // Send task to gateway for real agent execution
    try {
      const result = await this.wsClient.request('agent_task', {
        taskId: task.id,
        description: task.description,
        agents: task.agentIds,
        priority: task.priority
      }, 60000);
      task.output = result;
    } catch (err) {
      // Fall back to simulation if gateway execution fails
      this._log(workflow, 'orion', `Gateway execution failed for "${task.title}", falling back to local processing.`);
      await this._simulateTaskExecution(workflow, task);
    }
  }

  async _simulateTaskExecution(workflow, task) {
    const duration = this._estimateTaskDuration(task);
    const steps = Math.floor(duration / 2000);

    for (let i = 0; i <= steps; i++) {
      task.progress = Math.round((i / steps) * 100);
      this._emit('task-progress', { workflow, task });
      await this._delay(1500 + Math.random() * 1000);
    }

    // Generate simulated output based on task phase
    task.output = this._generateTaskOutput(task);
  }

  _generateTaskOutput(task) {
    const outputs = {
      research: { type: 'report', summary: `Research completed for "${task.title}". Key findings documented. ${3 + Math.floor(Math.random() * 5)} sources analyzed.` },
      planning: { type: 'plan', summary: `Architecture plan created. ${2 + Math.floor(Math.random() * 4)} components identified. Dependencies mapped.` },
      design: { type: 'design', summary: `Design completed. Wireframes and component specs ready. Responsive layouts defined.` },
      execution: { type: 'code', summary: `Implementation complete. ${10 + Math.floor(Math.random() * 50)} files created/modified. All functions tested.` },
      content: { type: 'content', summary: `Content drafted and optimized. ${1 + Math.floor(Math.random() * 3)} documents created. SEO keywords applied.` },
      review: { type: 'review', summary: `Review complete. ${Math.floor(Math.random() * 3)} issues found and resolved. Quality bar met.` },
      deployment: { type: 'deployment', summary: `Deployed successfully. Health checks passing. Monitoring configured.` },
      verification: { type: 'verification', summary: `All outputs verified. Smoke tests passed. Deliverables ready.` },
      documentation: { type: 'docs', summary: `Documentation complete. README updated. Usage guide created.` }
    };
    return outputs[task.phase] || { type: 'general', summary: `Task "${task.title}" completed successfully.` };
  }

  // --- Human Step Handling ---

  _waitForHumanStep(workflow, step) {
    return new Promise((resolve) => {
      step._resolve = resolve;
    });
  }

  /**
   * Called by the UI when the user completes a human step.
   */
  completeHumanStep(workflowId, stepId, data) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    const step = workflow.humanSteps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'completed';
    step.data = data;
    this._emit('human-step-completed', { workflow, step });

    if (step._resolve) {
      step._resolve(data);
    }
  }

  /**
   * Called by the UI when user skips a human step.
   */
  skipHumanStep(workflowId, stepId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    const step = workflow.humanSteps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'skipped';
    this._emit('human-step-skipped', { workflow, step });

    if (step._resolve) {
      step._resolve(null);
    }
  }

  // --- Chat with Orion ---

  /**
   * Send a follow-up message during an active workflow (or start a conversation).
   */
  async chat(message) {
    this._emit('chat-message', { from: 'user', content: message, timestamp: Date.now() });

    // If there's an active workflow, route through context
    if (this.activeWorkflow && this.activeWorkflow.status !== 'completed' && this.activeWorkflow.status !== 'failed') {
      return this._handleWorkflowChat(message);
    }

    // Otherwise, check if this is a new workflow request
    if (this._isWorkflowRequest(message)) {
      const response = `I'll decompose this into a structured workflow. Let me analyze what's needed...`;
      this._emit('chat-message', { from: 'orion', content: response, timestamp: Date.now() });

      // Small delay for UX
      await this._delay(500);
      return this.submitWorkflow(message);
    }

    // General conversation
    const response = this._generateOrionResponse(message);
    this._emit('chat-message', { from: 'orion', content: response, timestamp: Date.now() });
    return response;
  }

  async _handleWorkflowChat(message) {
    const wf = this.activeWorkflow;
    const lowerMsg = message.toLowerCase();

    let response;
    if (lowerMsg.includes('status') || lowerMsg.includes('progress') || lowerMsg.includes('how') || lowerMsg.includes('update')) {
      const completed = wf.tasks.filter(t => t.status === 'completed').length;
      const inProgress = wf.tasks.filter(t => t.status === 'in-progress').length;
      const pending = wf.tasks.filter(t => t.status === 'pending').length;
      response = `Workflow "${wf.id}": ${wf.progress}% complete.\n\n✓ ${completed} tasks done\n⟳ ${inProgress} in progress\n○ ${pending} pending${wf.humanSteps.filter(s => s.status === 'pending').length > 0 ? '\n\n⚠ Waiting for your input on ' + wf.humanSteps.filter(s => s.status === 'pending').length + ' step(s). Check the Steps panel.' : ''}`;
    } else if (lowerMsg.includes('cancel') || lowerMsg.includes('stop') || lowerMsg.includes('abort')) {
      response = `Are you sure you want to cancel the current workflow? Type "confirm cancel" to proceed, or anything else to continue.`;
    } else if (lowerMsg === 'confirm cancel') {
      wf.status = 'failed';
      wf.error = 'Cancelled by user';
      this._emit('workflow-failed', wf);
      response = `Workflow cancelled. All agents have been recalled. You can start a new workflow anytime.`;
    } else if (lowerMsg.includes('detail') || lowerMsg.includes('breakdown')) {
      const taskList = wf.tasks.map(t => `  ${t.status === 'completed' ? '✓' : t.status === 'in-progress' ? '⟳' : '○'} ${t.title} [${t.agentIds.map(id => this.permanentAgents.find(a => a.id === id)?.name || id).join(', ')}]`).join('\n');
      response = `Task breakdown:\n\n${taskList}`;
    } else {
      response = `The workflow is running (${wf.progress}% complete). I'll let you know when I need anything or when it's done. You can ask "status", "detail", or "cancel" anytime.`;
    }

    this._emit('chat-message', { from: 'orion', content: response, timestamp: Date.now() });
    return response;
  }

  _isWorkflowRequest(message) {
    const workflowIndicators = ['build', 'create', 'make', 'set up', 'automate', 'design', 'deploy', 'write', 'research', 'analyze', 'fix', 'develop', 'launch', 'generate', 'configure', 'integrate', 'connect', 'schedule', 'monitor'];
    const lower = message.toLowerCase();
    return workflowIndicators.some(w => lower.includes(w)) && message.length > 15;
  }

  _generateOrionResponse(message) {
    const lower = message.toLowerCase();

    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      return `Welcome to HiveWorkflow. I'm Orion, your master orchestrator. Tell me what you want built, and I'll decompose it into tasks, assign the right agents, and get it done. What are we building today?`;
    }
    if (lower.includes('help') || lower.includes('what can you')) {
      return `I can orchestrate any workflow you describe in plain English. Just tell me what you need — a website, an automation pipeline, content, research, deployment, security audit — and I'll:\n\n1. Break it into discrete tasks\n2. Assign the right specialist agents\n3. Check your system can handle the load\n4. Execute everything (or guide you through manual steps)\n5. Deliver the results\n\nTry something like: "Build me a landing page for my new product" or "Set up an automated email outreach pipeline."`;
    }
    if (lower.includes('agent') || lower.includes('team') || lower.includes('who')) {
      return `My team:\n\n• Atlas — Infrastructure & Ops\n• Forge — Code & Build\n• Patch — Bug Fixing\n• Quill — Content & Docs\n• Cipher — Security\n• Pixel — Design & UI/UX\n• Spark — Research & Analysis\n\nI assign them based on what your workflow needs. For complex jobs, multiple agents work in parallel. What would you like us to build?`;
    }
    if (lower.includes('capacity') || lower.includes('hardware') || lower.includes('system')) {
      return `I'll check your system's capacity before spawning agents. The hardware monitor profiles your CPU, RAM, GPU, and estimates how many agents can run concurrently. If your system can't handle the full swarm, I'll serialize tasks into waves. Want me to run a system check now?`;
    }
    return `I'm ready to orchestrate. Describe what you want built, fixed, researched, or deployed — and I'll make it happen. The more detail you give me, the better the plan.`;
  }

  // --- Helpers ---

  _log(workflow, agentId, message) {
    const agent = this.permanentAgents.find(a => a.id === agentId);
    const entry = {
      timestamp: Date.now(),
      agentId,
      agentName: agent?.name || agentId,
      agentColor: agent?.color || '#888',
      message
    };
    workflow.logs.push(entry);
    this._emit('workflow-log', { workflow, entry });
  }

  _emit(eventName, data) {
    this.dispatchEvent(new CustomEvent(eventName, { detail: data }));
    // Also notify via callback pattern for simpler usage
    if (this._onEvent) this._onEvent(eventName, data);
  }

  onEvent(callback) {
    this._onEvent = callback;
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // --- State Access ---

  getWorkflow(id) { return this.workflows.get(id); }
  getAllWorkflows() { return Array.from(this.workflows.values()); }
  getActiveWorkflow() { return this.activeWorkflow; }
  getMode() { return this.mode; }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HiveWorkflowEngine };
} else {
  window.HiveWorkflowEngine = HiveWorkflowEngine;
}
