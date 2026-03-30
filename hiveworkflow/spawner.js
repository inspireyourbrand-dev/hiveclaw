/**
 * HiveWorkflow — Agent Spawner
 *
 * Dynamically creates, manages, and retires agents within hardware constraints.
 * Works with the HW Monitor to ensure we never exceed system capacity.
 *
 * Spawned agents are ephemeral — they exist for a specific workflow task,
 * report back to Orion, and are retired when done.
 */

class HiveAgentSpawner {
  constructor(opts = {}) {
    this.wsClient = opts.wsClient || null;
    this.hwMonitor = opts.hwMonitor || null;
    this.engine = opts.engine || null;

    // Active spawned agents
    this.agents = new Map();      // agentId → SpawnedAgent
    this.agentCounter = 0;

    // Capacity tracking
    this.maxAgents = opts.maxAgents || 20;
    this.reservedSlots = 2; // Always keep 2 slots free for permanent agents

    // Agent templates for common specializations
    this.templates = {
      'web-scraper': {
        role: 'Web Scraper',
        capabilities: ['fetch', 'parse', 'extract'],
        tools: ['web_fetch', 'web_search', 'exec'],
        model: 'fast',
        ramMB: 100,
        description: 'Fetches and parses web content'
      },
      'code-writer': {
        role: 'Code Writer',
        capabilities: ['code', 'build', 'test'],
        tools: ['exec', 'read', 'write', 'edit'],
        model: 'strong',
        ramMB: 200,
        description: 'Writes and tests code'
      },
      'content-writer': {
        role: 'Content Writer',
        capabilities: ['write', 'edit', 'seo'],
        tools: ['read', 'write', 'web_search'],
        model: 'strong',
        ramMB: 150,
        description: 'Writes and edits content'
      },
      'data-analyst': {
        role: 'Data Analyst',
        capabilities: ['analyze', 'visualize', 'report'],
        tools: ['exec', 'read', 'write'],
        model: 'strong',
        ramMB: 300,
        description: 'Analyzes data and produces reports'
      },
      'api-integrator': {
        role: 'API Integrator',
        capabilities: ['api', 'configure', 'test'],
        tools: ['exec', 'web_fetch', 'read', 'write'],
        model: 'fast',
        ramMB: 100,
        description: 'Connects and configures APIs'
      },
      'qa-tester': {
        role: 'QA Tester',
        capabilities: ['test', 'verify', 'report'],
        tools: ['exec', 'browser', 'read'],
        model: 'fast',
        ramMB: 150,
        description: 'Tests and validates outputs'
      },
      'designer': {
        role: 'Visual Designer',
        capabilities: ['design', 'css', 'svg'],
        tools: ['read', 'write', 'exec'],
        model: 'strong',
        ramMB: 200,
        description: 'Creates visual assets and CSS'
      },
      'researcher': {
        role: 'Researcher',
        capabilities: ['research', 'summarize', 'compare'],
        tools: ['web_search', 'web_fetch', 'read', 'write'],
        model: 'strong',
        ramMB: 150,
        description: 'Researches topics and produces summaries'
      },
      'monitor': {
        role: 'System Monitor',
        capabilities: ['monitor', 'alert', 'report'],
        tools: ['exec', 'read'],
        model: 'fast',
        ramMB: 50,
        description: 'Monitors system health and processes'
      },
      'general': {
        role: 'General Agent',
        capabilities: ['general'],
        tools: ['exec', 'read', 'write', 'web_search'],
        model: 'fast',
        ramMB: 100,
        description: 'General-purpose task agent'
      }
    };

    // Color palette for spawned agents (rotate through these)
    this.colorPalette = [
      '#ff9f43', '#ee5a24', '#0abde3', '#10ac84',
      '#5f27cd', '#c44569', '#f8b739', '#e15f41',
      '#3dc1d3', '#b71540', '#aaa69d', '#2C3A47'
    ];
  }

  // --- Spawn Management ---

  /**
   * Spawn a new dynamic agent for a specific task.
   * Returns the spawned agent object or null if capacity exceeded.
   */
  async spawn(taskDescription, templateName = 'general', opts = {}) {
    // Check capacity
    const activeCount = this.getActiveCount();
    const effectiveMax = this.maxAgents - this.reservedSlots;

    if (activeCount >= effectiveMax) {
      // Try to retire idle agents first
      const retired = this._retireIdleAgents();
      if (this.getActiveCount() >= effectiveMax) {
        return {
          ok: false,
          error: `Agent capacity reached (${activeCount}/${effectiveMax}). Cannot spawn new agent.`,
          suggestion: 'Wait for running agents to complete, or cancel lower-priority tasks.'
        };
      }
    }

    // Hardware check
    if (this.hwMonitor) {
      const template = this.templates[templateName] || this.templates.general;
      const check = await this.hwMonitor.canSpawn(1, 'api-routed');
      if (!check.ok) {
        return {
          ok: false,
          error: `Insufficient resources: ${check.reason}`,
          suggestion: 'Free up system resources or use a lighter agent type.'
        };
      }
    }

    // Create the agent
    const agent = this._createAgent(taskDescription, templateName, opts);
    this.agents.set(agent.id, agent);

    // If connected to gateway, register via WS
    if (this.wsClient && this.wsClient.connected) {
      try {
        await this.wsClient.request('spawn_agent', {
          agentId: agent.id,
          name: agent.name,
          role: agent.role,
          tools: agent.tools,
          model: agent.model,
          workspace: agent.workspace
        });
        agent.registeredWithGateway = true;
      } catch (e) {
        // Continue without gateway registration — agent runs locally
        agent.registeredWithGateway = false;
      }
    }

    this._notifySpawn(agent);
    return { ok: true, agent };
  }

  /**
   * Retire (destroy) a spawned agent.
   */
  retire(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.status = 'retired';
    agent.retiredAt = Date.now();

    // Unregister from gateway
    if (agent.registeredWithGateway && this.wsClient?.connected) {
      this.wsClient.request('retire_agent', { agentId }).catch(() => {});
    }

    this._notifyRetire(agent);
    return true;
  }

  /**
   * Assign a task to a spawned agent.
   */
  async assignTask(agentId, task) {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status !== 'idle') {
      return { ok: false, error: 'Agent not available' };
    }

    agent.status = 'working';
    agent.currentTask = task;
    agent.taskStartedAt = Date.now();
    this._notifyUpdate(agent);

    return { ok: true };
  }

  /**
   * Mark a spawned agent's task as complete.
   */
  completeTask(agentId, result) {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.status = 'idle';
    agent.tasksCompleted++;
    agent.lastResult = result;
    agent.currentTask = null;
    agent.taskStartedAt = null;
    this._notifyUpdate(agent);

    // Auto-retire if it was a one-shot agent
    if (agent.oneShot) {
      this.retire(agentId);
    }

    return true;
  }

  // --- Batch Operations ---

  /**
   * Spawn multiple agents for a set of tasks.
   * Respects capacity limits — will spawn as many as possible and queue the rest.
   */
  async spawnBatch(tasks) {
    const results = [];
    const queued = [];

    for (const task of tasks) {
      const result = await this.spawn(
        task.description,
        task.template || 'general',
        { workflowId: task.workflowId, oneShot: true }
      );

      if (result.ok) {
        results.push(result.agent);
      } else {
        queued.push(task);
      }
    }

    return { spawned: results, queued, total: tasks.length };
  }

  /**
   * Retire all agents for a given workflow.
   */
  retireWorkflowAgents(workflowId) {
    let count = 0;
    for (const [id, agent] of this.agents) {
      if (agent.workflowId === workflowId && agent.status !== 'retired') {
        this.retire(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Retire all idle agents.
   */
  _retireIdleAgents() {
    let count = 0;
    for (const [id, agent] of this.agents) {
      if (agent.status === 'idle' && agent.tasksCompleted > 0) {
        this.retire(id);
        count++;
      }
    }
    return count;
  }

  // --- Queries ---

  getActiveCount() {
    let count = 0;
    for (const agent of this.agents.values()) {
      if (agent.status !== 'retired') count++;
    }
    return count;
  }

  getWorkingCount() {
    let count = 0;
    for (const agent of this.agents.values()) {
      if (agent.status === 'working') count++;
    }
    return count;
  }

  getAgent(id) { return this.agents.get(id); }

  getAllAgents() { return Array.from(this.agents.values()); }

  getActiveAgents() { return this.getAllAgents().filter(a => a.status !== 'retired'); }

  getWorkflowAgents(workflowId) {
    return this.getAllAgents().filter(a => a.workflowId === workflowId);
  }

  getCapacityStatus() {
    const active = this.getActiveCount();
    const effectiveMax = this.maxAgents - this.reservedSlots;
    return {
      active,
      max: effectiveMax,
      available: effectiveMax - active,
      utilization: Math.round((active / effectiveMax) * 100),
      health: active < effectiveMax * 0.7 ? 'healthy' : active < effectiveMax * 0.9 ? 'warm' : 'hot'
    };
  }

  // --- Internal ---

  _createAgent(taskDescription, templateName, opts) {
    const template = this.templates[templateName] || this.templates.general;
    const id = `spawn-${++this.agentCounter}-${Date.now().toString(36)}`;
    const colorIndex = this.agentCounter % this.colorPalette.length;

    return {
      id,
      name: `${template.role} #${this.agentCounter}`,
      role: template.role,
      capabilities: [...template.capabilities],
      tools: [...template.tools],
      model: template.model,
      ramMB: template.ramMB,
      description: template.description,
      color: this.colorPalette[colorIndex],
      icon: template.role.charAt(0).toUpperCase(),

      // State
      status: 'idle',               // idle → working → retired
      currentTask: null,
      taskStartedAt: null,
      tasksCompleted: 0,
      lastResult: null,

      // Metadata
      createdAt: Date.now(),
      retiredAt: null,
      workflowId: opts.workflowId || null,
      oneShot: opts.oneShot || false,
      registeredWithGateway: false,
      workspace: `agents/spawned/${id}/`,

      // Original request context
      taskDescription
    };
  }

  _notifySpawn(agent) {
    if (this.engine?._onEvent) {
      this.engine._onEvent('agent-spawned', { agent });
    }
    // Dispatch to any listening screens (Team, Office)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hive-agent-spawned', { detail: agent }));
    }
  }

  _notifyRetire(agent) {
    if (this.engine?._onEvent) {
      this.engine._onEvent('agent-retired', { agent });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hive-agent-retired', { detail: agent }));
    }
  }

  _notifyUpdate(agent) {
    if (this.engine?._onEvent) {
      this.engine._onEvent('agent-updated', { agent });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hive-agent-updated', { detail: agent }));
    }
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HiveAgentSpawner };
} else {
  window.HiveAgentSpawner = HiveAgentSpawner;
}
