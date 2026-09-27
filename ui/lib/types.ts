// Mirrors TaskManagerPlus.Core.Model. Null values are omitted by the host, so they are optional here.

export type SensorKind =
  | "load"
  | "temperature"
  | "clock"
  | "power"
  | "voltage"
  | "current"
  | "fan"
  | "control"
  | "data"
  | "smallData"
  | "throughput"
  | "level"
  | "factor"
  | "energy"
  | "frequency"
  | "other";

export interface SensorReading {
  name: string;
  kind: SensorKind;
  value?: number;
  min?: number;
  max?: number;
}

export interface SystemSummary {
  processCount: number;
  threadCount: number;
  handleCount: number;
  uptimeSeconds: number;
  tracingActive: boolean;
  sensorDriverAvailable: boolean;
}

export interface CpuSnapshot {
  id: string;
  name: string;
  cores: number;
  logicalProcessors: number;
  utilization: number;
  logicalLoads: number[];
  clockMhz?: number;
  baseClockMhz?: number;
  temperature?: number;
  packagePower?: number;
  l2CacheBytes?: number;
  l3CacheBytes?: number;
  sensors: SensorReading[];
}

export interface GpuSnapshot {
  id: string;
  name: string;
  vendor: string;
  isIntegrated: boolean;
  utilization: number;
  engines: Record<string, number>;
  dedicatedTotal: number;
  dedicatedUsed: number;
  sharedTotal: number;
  sharedUsed: number;
  temperature?: number;
  coreClockMhz?: number;
  memoryClockMhz?: number;
  power?: number;
  fanRpm?: number;
  sensors: SensorReading[];
}

export interface MemoryModule {
  slot: string;
  manufacturer: string;
  partNumber: string;
  capacity: number;
  speedMts?: number;
  formFactor: string;
}

export interface MemorySnapshot {
  /** RAM installed on the mainboard; `total` is what Windows can use. */
  installed: number;
  total: number;
  used: number;
  available: number;
  committed: number;
  commitLimit: number;
  cached: number;
  pagedPool: number;
  nonPagedPool: number;
  speedMts?: number;
  modules: MemoryModule[];
  sensors: SensorReading[];
}

export interface VolumeInfo {
  letter: string;
  label: string;
  fileSystem: string;
  total: number;
  free: number;
}

export interface DiskSnapshot {
  id: string;
  index: number;
  name: string;
  mediaType: string;
  busType: string;
  size: number;
  volumes: VolumeInfo[];
  activePercent: number;
  readBytesPerSec: number;
  writeBytesPerSec: number;
  averageResponseMs: number;
  temperature?: number;
  lifeRemainingPercent?: number;
  sensors: SensorReading[];
}

export interface WifiInfo {
  ssid: string;
  signalPercent: number;
  channel?: number;
  band?: string;
  rxRateMbps?: number;
  txRateMbps?: number;
}

export interface NetworkAdapterSnapshot {
  id: string;
  name: string;
  description: string;
  kind: "Ethernet" | "Wi-Fi" | "Virtual" | "Mobile" | "Dial-up" | "Other";
  isUp: boolean;
  linkSpeedBitsPerSec: number;
  macAddress: string;
  iPv4: string[];
  iPv6: string[];
  gateways: string[];
  dnsServers: string[];
  dhcpEnabled: boolean;
  receiveBytesPerSec: number;
  sendBytesPerSec: number;
  totalReceived: number;
  totalSent: number;
  wifi?: WifiInfo;
}

export interface LatencySnapshot {
  gatewayAddress?: string;
  gatewayMs?: number;
  internetTarget: string;
  internetMs?: number;
  packetLossPercent: number;
}

export type ProcessCategory = "app" | "background" | "windows";
export type SignatureState = "unknown" | "valid" | "unsigned" | "invalid";
export type ThreatLevel = "none" | "notice" | "warning";

export interface GpuProcessUsage {
  adapterId: string;
  utilization: number;
  engines: Record<string, number>;
  dedicatedBytes: number;
  sharedBytes: number;
}

export interface DiskProcessUsage {
  diskIndex: number;
  readBytesPerSec: number;
  writeBytesPerSec: number;
}

export interface ProcessSnapshot {
  pid: number;
  parentPid: number;
  groupId: number;
  name: string;
  path?: string;
  description?: string;
  company?: string;
  category: ProcessCategory;
  isCritical: boolean;
  /** The running Task Manager+ itself. */
  isSelf: boolean;
  windowTitle?: string;
  sessionId: number;
  startTime?: string;
  cpu: number;
  workingSet: number;
  privateBytes: number;
  threads: number;
  handles: number;
  diskReadBytesPerSec: number;
  diskWriteBytesPerSec: number;
  disks: DiskProcessUsage[];
  netReceiveBytesPerSec: number;
  netSendBytesPerSec: number;
  gpu: GpuProcessUsage[];
  signature: SignatureState;
  signer?: string;
  threat: ThreatLevel;
  threatReasons: string[];
}

export interface Snapshot {
  timestamp: string;
  summary: SystemSummary;
  cpus: CpuSnapshot[];
  gpus: GpuSnapshot[];
  memory: MemorySnapshot;
  disks: DiskSnapshot[];
  adapters: NetworkAdapterSnapshot[];
  latency: LatencySnapshot;
  processes: ProcessSnapshot[];
}

export type AutostartSource =
  | "registryUser"
  | "registryMachine"
  | "registryMachine32"
  | "startupFolderUser"
  | "startupFolderCommon"
  | "scheduledTask";

export interface AutostartEntry {
  id: string;
  name: string;
  command: string;
  imagePath?: string;
  publisher?: string;
  source: AutostartSource;
  location: string;
  enabled: boolean;
  canToggle: boolean;
  signature: SignatureState;
  isSelf: boolean;
}

export interface ServiceEntry {
  name: string;
  displayName: string;
  description?: string;
  status: string;
  startType: string;
  delayedStart: boolean;
  imagePath?: string;
  pid?: number;
  account: string;
  isMicrosoft: boolean;
  canStop: boolean;
  signature: SignatureState;
  signer?: string;
}

export interface ConnectionEntry {
  protocol: "TCP" | "UDP";
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  state: string;
  pid: number;
  processName: string;
}

export interface SystemInfo {
  computerName: string;
  osName: string;
  osVersion: string;
  motherboard?: string;
  bios?: string;
  isElevated: boolean;
  sensorDriverAvailable: boolean;
  appVersion: string;
}

export interface Settings {
  closeToTray: boolean;
  startWithWindows: boolean;
  startMinimized: boolean;
  detailMode: boolean;
  retentionDays: number;
  refreshIntervalMs: number;
  theme: "system" | "light" | "dark";
  performanceMode: boolean;
  overlay: OverlaySettings;
}

export type OverlayMetricId = "cpu" | "gpu" | "ram" | "disk" | "net";
export type OverlayShow = "load" | "temperature" | "traffic" | "ping";

export interface OverlaySettings {
  enabled: boolean;
  edge: "top" | "left" | "right";
  size: "small" | "medium" | "large";
  /** Device name of the display; absent means the primary display. */
  display?: string;
  metrics: { id: OverlayMetricId; show: OverlayShow }[];
}

export interface DisplayInfo {
  id: string;
  index: number;
  primary: boolean;
  width: number;
  height: number;
}

export interface HistoryPoint {
  timestamp: number;
  value: number;
}

export interface HistoryResponse {
  from: number;
  to: number;
  bucket: number;
  series: Record<string, HistoryPoint[]>;
}

export interface TopProcessEntry {
  name: string;
  value: number;
}

export interface ProcessDetails {
  commandLine?: string;
  executablePath?: string;
  priority: number;
  owner?: string;
}
