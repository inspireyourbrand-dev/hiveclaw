/**
 * HiveWorkflow — Hardware Monitor
 *
 * Probes the host system to determine CPU, RAM, GPU, disk,
 * and running process profile. Estimates max concurrent agents
 * based on model memory requirements.
 *
 * Works in two modes:
 *   - Browser: uses navigator APIs + Performance API (limited)
 *   - Server:  uses Node.js os/child_process for full profiling
 *
 * Agent memory estimates:
 *   - Local LLM agent (Ollama 7B):  ~4GB RAM + 1 CPU core
 *   - Local LLM agent (Ollama 13B): ~8GB RAM + 2 CPU cores
 *   - Local LLM agent (Ollama 70B): ~40GB RAM + 4 CPU cores + GPU
 *   - API-routed agent (Claude/GPT): ~50MB RAM + 0.1 CPU core
 *   - Lightweight tool agent:         ~25MB RAM + 0.1 CPU core
 */

class HiveHWMonitor {
  constructor(opts = {}) {
    this.wsClient = opts.wsClient || null;
    this.cache = null;
    this.cacheExpiry = 0;
    this.cacheTTL = opts.cacheTTL || 30000; // 30 second cache
    this.agentProfiles = {
      'local-7b':    { ram: 4096, cpuCores: 1, gpuRequired: false, label: 'Local 7B Model' },
      'local-13b':   { ram: 8192, cpuCores: 2, gpuRequired: false, label: 'Local 13B Model' },
      'local-70b':   { ram: 40960, cpuCores: 4, gpuRequired: true, label: 'Local 70B Model' },
      'api-routed':  { ram: 50, cpuCores: 0.1, gpuRequired: false, label: 'API-Routed (Claude/GPT)' },
      'tool-agent':  { ram: 25, cpuCores: 0.1, gpuRequired: false, label: 'Lightweight Tool Agent' }
    };
    this.defaultAgentProfile = 'api-routed';
  }

  /**
   * Get full system profile with capacity estimation.
   */
  async getSystemProfile() {
    // Return cached if fresh
    if (this.cache && Date.now() < this.cacheExpiry) return this.cache;

    let profile;

    if (typeof window !== 'undefined') {
      // Browser mode — use what we can from navigator/performance APIs
      profile = await this._probeBrowser();
    } else {
      // Node mode — full system probe
      profile = await this._probeNode();
    }

    // Estimate agent capacity
    profile.agentCapacity = this._estimateCapacity(profile);
    profile.maxConcurrentAgents = profile.agentCapacity.recommended;
    profile.timestamp = Date.now();

    this.cache = profile;
    this.cacheExpiry = Date.now() + this.cacheTTL;
    return profile;
  }

  /**
   * Quick check: can we spawn N more agents?
   */
  async canSpawn(count, agentType = 'api-routed') {
    const profile = await this.getSystemProfile();
    const agentReq = this.agentProfiles[agentType] || this.agentProfiles['api-routed'];
    const totalRamNeeded = agentReq.ram * count;
    const totalCoresNeeded = agentReq.cpuCores * count;

    return {
      ok: totalRamNeeded <= profile.availableRam && totalCoresNeeded <= profile.availableCores,
      ramNeeded: totalRamNeeded,
      ramAvailable: profile.availableRam,
      coresNeeded: totalCoresNeeded,
      coresAvailable: profile.availableCores,
      gpuNeeded: agentReq.gpuRequired,
      gpuAvailable: profile.gpu.available,
      reason: totalRamNeeded > profile.availableRam
        ? `Need ${this._formatMB(totalRamNeeded)} RAM but only ${this._formatMB(profile.availableRam)} available`
        : totalCoresNeeded > profile.availableCores
          ? `Need ${totalCoresNeeded} CPU cores but only ${profile.availableCores} available`
          : agentReq.gpuRequired && !profile.gpu.available
            ? 'GPU required but not detected'
            : 'Capacity available'
    };
  }

  /**
   * Get a formatted status summary for display.
   */
  async getStatusSummary() {
    const p = await this.getSystemProfile();
    return {
      cpu: `${p.cpuCores} cores (${p.cpuModel})`,
      ram: `${this._formatMB(p.totalRam)} total / ${this._formatMB(p.availableRam)} free`,
      gpu: p.gpu.available ? `${p.gpu.name} (${this._formatMB(p.gpu.vram)} VRAM)` : 'None detected',
      disk: `${this._formatMB(p.disk.free)} free of ${this._formatMB(p.disk.total)}`,
      maxAgents: {
        apiRouted: p.agentCapacity.apiRouted,
        local7b: p.agentCapacity.local7b,
        local13b: p.agentCapacity.local13b,
        recommended: p.agentCapacity.recommended
      },
      health: p.availableRam > 2048 ? 'healthy' : p.availableRam > 1024 ? 'constrained' : 'critical',
      healthColor: p.availableRam > 2048 ? '#00d49b' : p.availableRam > 1024 ? '#ffe930' : '#ff4757'
    };
  }

  // --- Browser Profiling ---

  async _probeBrowser() {
    const nav = navigator || {};
    const perf = performance || {};

    // CPU
    const cpuCores = nav.hardwareConcurrency || 4;

    // RAM — navigator.deviceMemory gives GB (only in Chrome)
    const deviceMemoryGB = nav.deviceMemory || 8;
    const totalRam = deviceMemoryGB * 1024; // Convert to MB

    // Estimate available RAM (browser can't know exactly — use heuristic)
    // Assume 60% of device memory is available for agent work
    const availableRam = Math.round(totalRam * 0.6);

    // Available CPU cores — reserve 2 for OS + browser
    const availableCores = Math.max(1, cpuCores - 2);

    // GPU detection via WebGL
    let gpu = { available: false, name: 'Unknown', vram: 0 };
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          gpu.name = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          gpu.available = true;
          // Estimate VRAM from GPU name
          gpu.vram = this._estimateVRAM(gpu.name);
        }
      }
    } catch (e) {}

    // Disk — Storage Manager API (Chrome)
    let disk = { total: 0, free: 0, used: 0 };
    try {
      if (nav.storage && nav.storage.estimate) {
        const est = await nav.storage.estimate();
        disk.total = Math.round((est.quota || 0) / (1024 * 1024));
        disk.used = Math.round((est.usage || 0) / (1024 * 1024));
        disk.free = disk.total - disk.used;
      }
    } catch (e) {}

    // Process count — not available in browser
    const runningProcesses = 0;

    return {
      platform: 'browser',
      os: nav.platform || 'Unknown',
      cpuModel: `${cpuCores}-core processor`,
      cpuCores,
      availableCores,
      totalRam,
      availableRam,
      gpu,
      disk,
      runningProcesses,
      nodeVersion: null,
      uptime: Math.round(perf.now?.() / 1000) || 0
    };
  }

  // --- Node.js Profiling ---

  async _probeNode() {
    try {
      const os = require('os');
      const { execSync } = require('child_process');

      // CPU
      const cpus = os.cpus();
      const cpuModel = cpus[0]?.model || 'Unknown';
      const cpuCores = cpus.length;
      const loadAvg = os.loadavg()[0]; // 1-minute load average
      const availableCores = Math.max(1, Math.round(cpuCores - loadAvg));

      // RAM
      const totalRam = Math.round(os.totalmem() / (1024 * 1024));
      const freeRam = Math.round(os.freemem() / (1024 * 1024));
      // Use free RAM minus 1GB safety buffer
      const availableRam = Math.max(0, freeRam - 1024);

      // GPU detection (Linux/macOS)
      let gpu = { available: false, name: 'None', vram: 0 };
      try {
        if (os.platform() === 'linux') {
          const nvidiaSmi = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null', { encoding: 'utf8' }).trim();
          if (nvidiaSmi) {
            const [name, vramStr] = nvidiaSmi.split(',').map(s => s.trim());
            gpu = { available: true, name, vram: parseInt(vramStr) || 0 };
          }
        } else if (os.platform() === 'darwin') {
          const spInfo = execSync('system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset\\|VRAM"', { encoding: 'utf8' }).trim();
          if (spInfo) {
            gpu = { available: true, name: spInfo.split('\n')[0]?.replace(/.*:\s*/, '') || 'Apple GPU', vram: 0 };
          }
        }
      } catch (e) {}

      // Disk
      let disk = { total: 0, free: 0, used: 0 };
      try {
        const dfOutput = execSync('df -m / | tail -1', { encoding: 'utf8' }).trim();
        const parts = dfOutput.split(/\s+/);
        disk.total = parseInt(parts[1]) || 0;
        disk.used = parseInt(parts[2]) || 0;
        disk.free = parseInt(parts[3]) || 0;
      } catch (e) {}

      // Running processes
      let runningProcesses = 0;
      try {
        const psCount = execSync('ps aux | wc -l', { encoding: 'utf8' }).trim();
        runningProcesses = parseInt(psCount) || 0;
      } catch (e) {}

      return {
        platform: 'node',
        os: `${os.platform()} ${os.release()}`,
        cpuModel,
        cpuCores,
        availableCores,
        totalRam,
        availableRam,
        gpu,
        disk,
        runningProcesses,
        nodeVersion: process.version,
        uptime: os.uptime()
      };

    } catch (e) {
      // Fallback if Node APIs fail
      return this._getDefaults();
    }
  }

  // --- Capacity Estimation ---

  _estimateCapacity(profile) {
    const { availableRam, availableCores, gpu } = profile;

    // API-routed agents (50MB each)
    const apiRouted = Math.min(
      Math.floor(availableRam / 50),
      Math.floor(availableCores / 0.1),
      100 // Practical cap
    );

    // Local 7B model agents (4GB each)
    const local7b = Math.min(
      Math.floor(availableRam / 4096),
      availableCores
    );

    // Local 13B model agents (8GB each)
    const local13b = Math.min(
      Math.floor(availableRam / 8192),
      Math.floor(availableCores / 2)
    );

    // Local 70B model agents (needs GPU)
    const local70b = gpu.available && gpu.vram >= 40000
      ? Math.min(Math.floor(gpu.vram / 40000), 1)
      : 0;

    // Recommended: assume API-routed agents but cap at a reasonable number
    // based on system resources. We want headroom for the OS and gateway.
    const recommended = Math.min(
      apiRouted,
      Math.max(2, Math.floor(availableCores * 2)),
      20 // Sensible max for most workflows
    );

    return {
      apiRouted,
      local7b,
      local13b,
      local70b,
      recommended,
      breakdown: {
        'API-Routed (Claude/GPT)': apiRouted,
        'Local 7B (Ollama)': local7b,
        'Local 13B (Ollama)': local13b,
        'Local 70B (Ollama)': local70b
      }
    };
  }

  _estimateVRAM(gpuName) {
    if (!gpuName) return 0;
    const name = gpuName.toLowerCase();

    // NVIDIA cards
    if (name.includes('4090')) return 24576;
    if (name.includes('4080')) return 16384;
    if (name.includes('4070')) return 12288;
    if (name.includes('3090')) return 24576;
    if (name.includes('3080')) return 10240;
    if (name.includes('a100')) return 81920;
    if (name.includes('h100')) return 81920;
    if (name.includes('a6000')) return 49152;

    // Apple Silicon
    if (name.includes('apple') || name.includes('m1') || name.includes('m2') || name.includes('m3') || name.includes('m4')) {
      return 0; // Shared memory, handled differently
    }

    // AMD
    if (name.includes('7900')) return 24576;
    if (name.includes('6900')) return 16384;

    return 4096; // Default estimate for unknown GPUs
  }

  _getDefaults() {
    return {
      platform: 'unknown',
      os: 'Unknown',
      cpuModel: 'Unknown',
      cpuCores: 4,
      availableCores: 2,
      totalRam: 8192,
      availableRam: 4096,
      gpu: { available: false, name: 'None', vram: 0 },
      disk: { total: 0, free: 0, used: 0 },
      runningProcesses: 0,
      nodeVersion: null,
      uptime: 0
    };
  }

  _formatMB(mb) {
    if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
    return mb + ' MB';
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HiveHWMonitor };
} else {
  window.HiveHWMonitor = HiveHWMonitor;
}
