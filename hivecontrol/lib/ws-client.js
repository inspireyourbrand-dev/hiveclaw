/**
 * HiveControl OS — WebSocket Client
 * Connects to the OpenClaw gateway WS API on port 18789.
 * Handles authentication, reconnection, event dispatching, and request/response.
 *
 * Usage:
 *   const hive = new HiveWSClient({ host: '127.0.0.1', port: 18789, token: '...' });
 *   hive.on('agent', (payload) => { ... });
 *   hive.on('health', (payload) => { ... });
 *   hive.connect();
 *   const res = await hive.request('memory_search', { query: 'test' });
 */

class HiveWSClient extends EventTarget {
  constructor(opts = {}) {
    super();
    this.host = opts.host || '127.0.0.1';
    this.port = opts.port || 18789;
    this.token = opts.token || null;
    this.deviceId = opts.deviceId || 'hivecontrol-' + Math.random().toString(36).slice(2, 10);
    this.autoReconnect = opts.autoReconnect !== false;
    this.reconnectInterval = opts.reconnectInterval || 3000;
    this.maxReconnectAttempts = opts.maxReconnectAttempts || 50;

    this._ws = null;
    this._connected = false;
    this._reconnectCount = 0;
    this._reconnectTimer = null;
    this._reqId = 0;
    this._pendingRequests = new Map();
    this._listeners = new Map();
  }

  // --- Connection lifecycle ---

  connect() {
    if (this._ws && (this._ws.readyState === WebSocket.CONNECTING || this._ws.readyState === WebSocket.OPEN)) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // If served by the gateway, connect to same host; otherwise use configured host:port
    const wsHost = (this.host === '127.0.0.1' || this.host === 'localhost')
      ? `${protocol}//${location.hostname}:${this.port}`
      : `${protocol}//${this.host}:${this.port}`;

    try {
      this._ws = new WebSocket(wsHost);
    } catch (e) {
      this._emitStatus('error', e.message);
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this._sendConnect();
    };

    this._ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        this._handleMessage(msg);
      } catch (e) {
        console.warn('[HiveWS] Bad frame:', e);
      }
    };

    this._ws.onclose = (evt) => {
      this._connected = false;
      this._emitStatus('disconnected', `Code ${evt.code}`);
      this._rejectAllPending('Connection closed');
      if (this.autoReconnect) this._scheduleReconnect();
    };

    this._ws.onerror = () => {
      this._emitStatus('error', 'WebSocket error');
    };
  }

  disconnect() {
    this.autoReconnect = false;
    clearTimeout(this._reconnectTimer);
    if (this._ws) {
      this._ws.close(1000, 'HiveControl disconnect');
      this._ws = null;
    }
    this._connected = false;
    this._emitStatus('disconnected', 'Manual disconnect');
  }

  get connected() { return this._connected; }

  // --- Send the OpenClaw connect frame ---

  _sendConnect() {
    const connectFrame = {
      type: 'connect',
      params: {
        device: { id: this.deviceId, name: 'HiveControl OS', type: 'web' }
      }
    };
    if (this.token) {
      connectFrame.params.auth = { token: this.token };
    }
    this._send(connectFrame);
  }

  // --- Request/response (typed protocol) ---

  request(method, params = {}, timeout = 15000) {
    return new Promise((resolve, reject) => {
      if (!this._connected) {
        reject(new Error('Not connected'));
        return;
      }
      const id = ++this._reqId;
      const frame = { type: 'req', id, method, params };
      const timer = setTimeout(() => {
        this._pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, timeout);
      this._pendingRequests.set(id, { resolve, reject, timer });
      this._send(frame);
    });
  }

  // --- Event listener sugar ---

  on(eventName, callback) {
    if (!this._listeners.has(eventName)) this._listeners.set(eventName, new Set());
    this._listeners.get(eventName).add(callback);
    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    const set = this._listeners.get(eventName);
    if (set) set.delete(callback);
  }

  _emit(eventName, payload) {
    const set = this._listeners.get(eventName);
    if (set) set.forEach(fn => { try { fn(payload); } catch(e) { console.error('[HiveWS] Listener error:', e); } });
    // Also emit wildcard
    const wild = this._listeners.get('*');
    if (wild) wild.forEach(fn => { try { fn(eventName, payload); } catch(e) {} });
  }

  _emitStatus(status, detail) {
    this._emit('_status', { status, detail, timestamp: Date.now() });
  }

  // --- Message handling ---

  _handleMessage(msg) {
    // Connection accepted
    if (msg.type === 'connected' || (msg.type === 'res' && msg.method === 'connect')) {
      this._connected = true;
      this._reconnectCount = 0;
      this._emitStatus('connected', 'Gateway connected');
      this._emit('connected', msg.payload || msg);
      return;
    }

    // Response to a request
    if (msg.type === 'res' && msg.id != null) {
      const pending = this._pendingRequests.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this._pendingRequests.delete(msg.id);
        if (msg.ok === false) {
          pending.reject(new Error(msg.error || 'Request failed'));
        } else {
          pending.resolve(msg.payload);
        }
      }
      return;
    }

    // Event
    if (msg.type === 'event') {
      this._emit(msg.event, msg.payload);
      return;
    }

    // Fallback — emit raw
    this._emit('raw', msg);
  }

  // --- Internal helpers ---

  _send(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
    }
  }

  _rejectAllPending(reason) {
    for (const [id, p] of this._pendingRequests) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this._pendingRequests.clear();
  }

  _scheduleReconnect() {
    if (this._reconnectCount >= this.maxReconnectAttempts) {
      this._emitStatus('failed', 'Max reconnect attempts reached');
      return;
    }
    clearTimeout(this._reconnectTimer);
    const delay = Math.min(this.reconnectInterval * Math.pow(1.3, this._reconnectCount), 30000);
    this._reconnectCount++;
    this._emitStatus('reconnecting', `Attempt ${this._reconnectCount} in ${Math.round(delay)}ms`);
    this._reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}

// --- HiveControl State Store ---
// Simple reactive store for sharing state across screens

class HiveStore {
  constructor() {
    this._state = {
      agents: [],
      tasks: [],
      memories: [],
      projects: [],
      documents: [],
      cronJobs: [],
      heartbeats: [],
      systemHealth: {},
      gatewayStatus: 'disconnected'
    };
    this._subscribers = new Map();
  }

  get(key) { return this._state[key]; }

  set(key, value) {
    this._state[key] = value;
    this._notify(key, value);
  }

  update(key, fn) {
    this._state[key] = fn(this._state[key]);
    this._notify(key, this._state[key]);
  }

  subscribe(key, callback) {
    if (!this._subscribers.has(key)) this._subscribers.set(key, new Set());
    this._subscribers.get(key).add(callback);
    // Immediate callback with current value
    callback(this._state[key]);
    return () => this._subscribers.get(key)?.delete(callback);
  }

  _notify(key, value) {
    const subs = this._subscribers.get(key);
    if (subs) subs.forEach(fn => { try { fn(value); } catch(e) {} });
  }
}

// --- Utilities ---

function formatTimestamp(ts) {
  if (!ts) return '--';
  const d = new Date(ts);
  return d.toLocaleString();
}

function formatRelativeTime(ts) {
  if (!ts) return '--';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function generateId() {
  return 'hc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// Export for use in screens
window.HiveWSClient = HiveWSClient;
window.HiveStore = HiveStore;
window.HiveUtils = { formatTimestamp, formatRelativeTime, generateId };
