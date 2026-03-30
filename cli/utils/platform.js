/**
 * Platform Detection Utilities
 *
 * Detects OS, architecture, and available resources for
 * hardware-aware agent spawning decisions.
 */

import { platform, arch, totalmem, freemem, cpus } from 'os';
import { execSync } from 'child_process';

/**
 * Get detailed platform information
 */
export function getPlatformInfo() {
  const os = platform();
  const architecture = arch();
  const totalRam = Math.round(totalmem() / (1024 * 1024));
  const freeRam = Math.round(freemem() / (1024 * 1024));
  const cpuCount = cpus().length;
  const cpuModel = cpus()[0]?.model || 'unknown';

  // Detect GPU (best effort)
  let gpu = 'none detected';
  try {
    if (os === 'linux') {
      gpu = execSync('lspci | grep -i vga 2>/dev/null || echo "none"', { encoding: 'utf-8' }).trim();
    } else if (os === 'darwin') {
      gpu = execSync('system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset Model" | head -1', { encoding: 'utf-8' }).trim();
    } else if (os === 'win32') {
      gpu = execSync('wmic path win32_videocontroller get caption /value 2>nul', { encoding: 'utf-8' }).trim();
    }
  } catch { /* GPU detection is best-effort */ }

  // Detect Docker
  let dockerAvailable = false;
  try {
    execSync('docker --version 2>&1', { encoding: 'utf-8' });
    dockerAvailable = true;
  } catch { /* no docker */ }

  return {
    os,
    osName: os === 'win32' ? 'Windows' : os === 'darwin' ? 'macOS' : 'Linux',
    architecture,
    cpu: { model: cpuModel, cores: cpuCount },
    ram: { total: totalRam, free: freeRam, usedPct: Math.round((1 - freeRam / totalRam) * 100) },
    gpu,
    docker: dockerAvailable,
    node: process.version,
  };
}

/**
 * Check if system meets minimum requirements for agent spawning
 */
export function canSpawnAgent(config = {}) {
  const minFreeRamMb = config.minFreeRamMb || 512;
  const minFreeCpuPct = config.minFreeCpuPct || 20;

  const freeRam = Math.round(freemem() / (1024 * 1024));
  const cpuLoad = cpus().reduce((sum, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return sum + (cpu.times.idle / total) * 100;
  }, 0) / cpus().length;

  return {
    canSpawn: freeRam >= minFreeRamMb && cpuLoad >= minFreeCpuPct,
    freeRamMb: freeRam,
    freeCpuPct: Math.round(cpuLoad),
    reason: freeRam < minFreeRamMb
      ? `Insufficient RAM (${freeRam}MB free, need ${minFreeRamMb}MB)`
      : cpuLoad < minFreeCpuPct
        ? `CPU too busy (${Math.round(cpuLoad)}% idle, need ${minFreeCpuPct}%)`
        : 'OK',
  };
}
