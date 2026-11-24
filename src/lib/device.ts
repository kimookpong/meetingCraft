export interface DeviceInfo {
  memoryGB?: number
  webgpu: boolean
  isolated: boolean
  cores: number
  ios: boolean
  quota?: number
  usage?: number
  persisted?: boolean
}

export async function deviceInfo(): Promise<DeviceInfo> {
  const est = await navigator.storage?.estimate?.().catch(() => undefined)
  const persisted = await navigator.storage?.persisted?.().catch(() => undefined)
  return {
    memoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    webgpu: 'gpu' in navigator,
    isolated: self.crossOriginIsolated,
    cores: navigator.hardwareConcurrency || 2,
    ios: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    quota: est?.quota,
    usage: est?.usage,
    persisted,
  }
}
