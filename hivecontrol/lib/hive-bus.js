/**
 * HiveControl OS — Cross-Screen Event Bus
 *
 * Bridges HiveWorkflow events to other HiveControl OS screens.
 * When a workflow creates tasks, spawns agents, or produces documents,
 * those updates propagate to the Tasks (Kanban), Team, Office, Documents,
 * and Dashboard screens in real time.
 *
 * Uses BroadcastChannel API for cross-iframe communication,
 * with a postMessage fallback for older browsers.
 *
 * Architecture:
 *   HiveWorkflow (engine events)
 *       ↓
 *   HiveBus (this file)
 *       ↓
 *   ┌──────────┬──────────┬──────────┬──────────┐
 *   │Dashboard │  Tasks   │  Team    │  Office  │
 *   └──────────┴──────────┴──────────┴──────────┘
 */

class HiveBus {
  constructor() {
    this._channel = null;
    this._listeners = new Map();
    this._messageQueue = [];
    this._ready = false;

    // Try BroadcastChannel first, then fallback to postMessage
    if (typeof BroadcastChannel !== 'undefined') {
      this._channel = new BroadcastChannel('hivecontrol-os');
      this._channel.onmessage = (evt) => this._handleIncoming(evt.data);
    } else {
      // Fallback: listen for postMessage from parent/children
      window.addEventListener('message', (evt) => {
        if (evt.data && evt.data._hiveBus) {
          this._handleIncoming(evt.data);
        }
      });
    }

    this._ready = true;
    this._flushQueue();
  }

  // --- Publish ---

  /**
   * Publish an event to all screens.
   * @param {string} event - Event name (e.g., 'workflow:task-created')
   * @param {object} data  - Event payload
   */
  publish(event, data) {
    const msg = {
      _hiveBus: true,
      event,
      data,
      timestamp: Date.now(),
      source: this._getScreenId()
    };

    if (!this._ready) {
      this._messageQueue.push(msg);
      return;
    }

    this._broadcast(msg);
    // Also dispatch locally
    this._handleIncoming(msg);
  }

  // --- Subscribe ---

  /**
   * Subscribe to an event.
   * @param {string} event    - Event name or '*' for all
   * @param {function} callback - Handler function
   * @returns {function} Unsubscribe function
   */
  on(event, callback) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const set = this._listeners.get(event);
    if (set) set.delete(callback);
  }

  // --- Integration Helpers ---

  /**
   * Publish a new task to the Tasks/Kanban screen.
   */
  publishTask(task) {
    this.publish('workflow:task-created', {
      id: task.id,
      title: task.title,
      description: task.description,
      assignee: task.agentIds?.join(', '),
      priority: task.priority,
      status: 'backlog',
      source: 'hiveworkflow',
      workflowId: task.workflowId || null,
      createdAt: Date.now()
    });
  }

  /**
   * Update a task's status on the Kanban.
   */
  publishTaskUpdate(taskId, updates) {
    this.publish('workflow:task-updated', {
      id: taskId,
      ...updates,
      updatedAt: Date.now()
    });
  }

  /**
   * Publish a new spawned agent to Team/Office screens.
   */
  publishAgentSpawn(agent) {
    this.publish('workflow:agent-spawned', {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      color: agent.color,
      icon: agent.icon,
      status: agent.status,
      capabilities: agent.capabilities,
      workflowId: agent.workflowId,
      isSpawned: true,
      createdAt: agent.createdAt
    });
  }

  /**
   * Publish agent status change to Team/Office screens.
   */
  publishAgentUpdate(agentId, status, currentTask) {
    this.publish('workflow:agent-updated', {
      id: agentId,
      status,
      currentTask,
      updatedAt: Date.now()
    });
  }

  /**
   * Publish agent retirement to Team/Office screens.
   */
  publishAgentRetire(agentId) {
    this.publish('workflow:agent-retired', {
      id: agentId,
      retiredAt: Date.now()
    });
  }

  /**
   * Publish a new document to the Documents screen.
   */
  publishDocument(doc) {
    this.publish('workflow:document-created', {
      id: doc.id || 'doc-' + Date.now().toString(36),
      title: doc.title,
      type: doc.type || 'markdown',
      content: doc.content,
      project: doc.project || null,
      agent: doc.agent || 'orion',
      createdAt: Date.now()
    });
  }

  /**
   * Publish a system alert to the Dashboard.
   */
  publishAlert(level, message) {
    this.publish('system:alert', {
      level, // 'info' | 'warning' | 'error' | 'success'
      message,
      timestamp: Date.now()
    });
  }

  /**
   * Publish a memory entry to the Memory screen.
   */
  publishMemory(entry) {
    this.publish('workflow:memory-created', {
      id: entry.id || 'mem-' + Date.now().toString(36),
      content: entry.content,
      agent: entry.agent || 'orion',
      type: entry.type || 'observation',
      tags: entry.tags || [],
      pinned: entry.pinned || false,
      timestamp: Date.now()
    });
  }

  /**
   * Publish workflow completion to Dashboard.
   */
  publishWorkflowComplete(workflow) {
    this.publish('workflow:completed', {
      id: workflow.id,
      request: workflow.request,
      tasksCompleted: workflow.tasks?.filter(t => t.status === 'completed').length || 0,
      totalTasks: workflow.tasks?.length || 0,
      duration: Date.now() - (workflow.createdAt || Date.now()),
      completedAt: Date.now()
    });
  }

  /**
   * Publish hardware status to Dashboard.
   */
  publishHWStatus(status) {
    this.publish('system:hw-status', status);
  }

  // --- Wire up HiveWorkflow engine events ---

  /**
   * Connect the bus to a HiveWorkflowEngine instance.
   * Automatically publishes all relevant events to other screens.
   */
  connectEngine(engine) {
    engine.onEvent((eventName, data) => {
      switch (eventName) {
        case 'workflow-created':
          this.publishAlert('info', `New workflow started: "${data.request?.substring(0, 60)}..."`);
          break;

        case 'task-started':
          this.publishTask(data.task);
          this.publishTaskUpdate(data.task.id, { status: 'in-progress' });
          // Update agent status
          for (const agentId of data.task.agentIds || []) {
            this.publishAgentUpdate(agentId, 'working', data.task.title);
          }
          break;

        case 'task-completed':
          this.publishTaskUpdate(data.task.id, { status: 'done' });
          for (const agentId of data.task.agentIds || []) {
            this.publishAgentUpdate(agentId, 'idle', null);
          }
          break;

        case 'task-failed':
          this.publishTaskUpdate(data.task.id, { status: 'failed', error: data.error?.message });
          this.publishAlert('error', `Task failed: "${data.task.title}"`);
          break;

        case 'workflow-completed':
          this.publishWorkflowComplete(data);
          this.publishAlert('success', `Workflow complete! ${data.tasks?.length || 0} tasks finished.`);
          this.publishMemory({
            content: `Workflow completed: "${data.request}". ${data.tasks?.length || 0} tasks executed.`,
            agent: 'orion',
            type: 'task-result',
            tags: ['workflow', 'completed']
          });
          break;

        case 'workflow-failed':
          this.publishAlert('error', `Workflow failed: ${data.error || 'Unknown error'}`);
          break;

        case 'agent-spawned':
          this.publishAgentSpawn(data.agent);
          break;

        case 'agent-retired':
          this.publishAgentRetire(data.agent?.id);
          break;

        case 'agent-updated':
          this.publishAgentUpdate(data.agent?.id, data.agent?.status, data.agent?.currentTask);
          break;

        case 'human-step-needed':
          this.publishAlert('warning', `Your input needed: "${data.step?.title}"`);
          break;
      }
    });
  }

  // --- Internal ---

  _broadcast(msg) {
    if (this._channel) {
      this._channel.postMessage(msg);
    } else {
      // Fallback: postMessage to parent and all child iframes
      try {
        if (window.parent !== window) {
          window.parent.postMessage(msg, '*');
        }
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
          try { iframe.contentWindow.postMessage(msg, '*'); } catch (e) {}
        });
      } catch (e) {}
    }
  }

  _handleIncoming(msg) {
    if (!msg || !msg.event) return;
    // Don't re-process our own messages (loop prevention)
    if (msg.source === this._getScreenId()) return;

    const listeners = this._listeners.get(msg.event);
    if (listeners) listeners.forEach(fn => { try { fn(msg.data); } catch (e) {} });

    const wildcards = this._listeners.get('*');
    if (wildcards) wildcards.forEach(fn => { try { fn(msg.event, msg.data); } catch (e) {} });
  }

  _getScreenId() {
    // Derive from URL or generate
    try {
      const path = window.location.pathname;
      const match = path.match(/screens\/(\w+)/);
      return match ? match[1] : 'unknown-' + Math.random().toString(36).slice(2, 6);
    } catch (e) {
      return 'unknown';
    }
  }

  _flushQueue() {
    while (this._messageQueue.length > 0) {
      this._broadcast(this._messageQueue.shift());
    }
  }

  destroy() {
    if (this._channel) {
      this._channel.close();
      this._channel = null;
    }
    this._listeners.clear();
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HiveBus };
} else {
  window.HiveBus = HiveBus;
}
