import type { Transport } from "./bridge";
import type {
  AutostartEntry,
  ConnectionEntry,
  HistoryResponse,
  ProcessCategory,
  ProcessSnapshot,
  SensorReading,
  ServiceEntry,
  Settings,
  Snapshot,
  SystemInfo,
} from "./types";

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const NVIDIA = "0x00000000_0x00018f92";
const IGPU = "0x00000000_0x0001a94e";

interface MockProcess {
  name: string;
  description: string;
  company: string;
  category: ProcessCategory;
  path: string;
  instances: number;
  cpu: number;
  ram: number;
  gpu?: number;
  net?: number;
  disk?: number;
  window?: string;
  critical?: boolean;
  signature?: "valid" | "unsigned";
}

const catalog: MockProcess[] = [
  { name: "chrome.exe", description: "Google Chrome", company: "Google LLC", category: "app", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", instances: 9, cpu: 3.2, ram: 1400 * MB, gpu: 4, net: 180_000, window: "Documentation - Google Chrome" },
  { name: "Discord.exe", description: "Discord", company: "Discord Inc.", category: "app", path: "C:\\Users\\User\\AppData\\Local\\Discord\\app-1.0.9259\\Discord.exe", instances: 6, cpu: 1.4, ram: 640 * MB, gpu: 1.2, net: 24_000, window: "Discord" },
  { name: "Spotify.exe", description: "Spotify", company: "Spotify Ltd", category: "app", path: "C:\\Users\\User\\AppData\\Roaming\\Spotify\\Spotify.exe", instances: 4, cpu: 0.8, ram: 420 * MB, net: 40_000, window: "Spotify Premium" },
  { name: "EpicGamesLauncher.exe", description: "Epic Games Launcher", company: "Epic Games, Inc.", category: "app", path: "C:\\Program Files\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe", instances: 3, cpu: 2.1, ram: 820 * MB, gpu: 1.1, net: 4_200_000, disk: 5_600_000, window: "Epic Games Launcher" },
  { name: "Code.exe", description: "Visual Studio Code", company: "Microsoft Corporation", category: "app", path: "C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", instances: 7, cpu: 1.9, ram: 980 * MB, gpu: 0.6, window: "main.ts - Visual Studio Code" },
  { name: "explorer.exe", description: "Windows Explorer", company: "Microsoft Corporation", category: "app", path: "C:\\Windows\\explorer.exe", instances: 1, cpu: 0.3, ram: 290 * MB, window: "Downloads" },
  { name: "wallpaper64.exe", description: "Wallpaper Engine", company: "Wallpaper Engine Team", category: "background", path: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe", instances: 1, cpu: 1.1, ram: 57 * MB, gpu: 12 },
  { name: "NVIDIA Overlay.exe", description: "NVIDIA Overlay", company: "NVIDIA Corporation", category: "background", path: "C:\\Program Files\\NVIDIA Corporation\\NVIDIA App\\CEF\\NVIDIA Overlay.exe", instances: 5, cpu: 0.4, ram: 460 * MB, gpu: 0.3 },
  { name: "iCUE.exe", description: "Corsair iCUE", company: "Corsair Memory, Inc.", category: "background", path: "C:\\Program Files\\Corsair\\Corsair iCUE5 Software\\iCUE.exe", instances: 3, cpu: 0.9, ram: 380 * MB, net: 800 },
  { name: "OneDrive.exe", description: "Microsoft OneDrive", company: "Microsoft Corporation", category: "background", path: "C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe", instances: 1, cpu: 0.1, ram: 110 * MB, net: 2_000 },
  { name: "Steam.exe", description: "Steam", company: "Valve Corporation", category: "background", path: "C:\\Program Files (x86)\\Steam\\steam.exe", instances: 4, cpu: 0.5, ram: 310 * MB, net: 3_000 },
  { name: "node.exe", description: "Node.js JavaScript Runtime", company: "Node.js", category: "background", path: "C:\\Program Files\\nodejs\\node.exe", instances: 2, cpu: 0.6, ram: 250 * MB, net: 1_200 },
  { name: "updater.exe", description: "", company: "", category: "background", path: "C:\\Users\\User\\AppData\\Local\\Temp\\7zS4A1\\updater.exe", instances: 1, cpu: 0.2, ram: 18 * MB, net: 90_000, signature: "unsigned" },
  { name: "python.exe", description: "Python", company: "Python Software Foundation", category: "background", path: "C:\\Users\\User\\AppData\\Roaming\\uv\\python\\cpython-3.14\\python.exe", instances: 1, cpu: 0.1, ram: 40 * MB, signature: "unsigned" },
  { name: "System", description: "NT Kernel & System", company: "Microsoft Corporation", category: "windows", path: "", instances: 1, cpu: 1.2, ram: 3 * MB, disk: 400_000, net: 8_000, critical: true },
  { name: "svchost.exe", description: "Host Process for Windows Services", company: "Microsoft Corporation", category: "windows", path: "C:\\Windows\\System32\\svchost.exe", instances: 38, cpu: 0.05, ram: 18 * MB, net: 600, critical: true },
  { name: "dwm.exe", description: "Desktop Window Manager", company: "Microsoft Corporation", category: "windows", path: "C:\\Windows\\System32\\dwm.exe", instances: 1, cpu: 1.1, ram: 108 * MB, gpu: 3.5, critical: true },
  { name: "csrss.exe", description: "Client Server Runtime Process", company: "Microsoft Corporation", category: "windows", path: "C:\\Windows\\System32\\csrss.exe", instances: 2, cpu: 0.1, ram: 7 * MB, critical: true },
  { name: "lsass.exe", description: "Local Security Authority Process", company: "Microsoft Corporation", category: "windows", path: "C:\\Windows\\System32\\lsass.exe", instances: 1, cpu: 0.05, ram: 34 * MB, critical: true },
  { name: "MsMpEng.exe", description: "Antimalware Service Executable", company: "Microsoft Corporation", category: "windows", path: "C:\\ProgramData\\Microsoft\\Windows Defender\\Platform\\MsMpEng.exe", instances: 1, cpu: 0.7, ram: 490 * MB, disk: 300_000, critical: true },
  { name: "SearchIndexer.exe", description: "Microsoft Windows Search Indexer", company: "Microsoft Corporation", category: "windows", path: "C:\\Windows\\System32\\SearchIndexer.exe", instances: 1, cpu: 0.2, ram: 41 * MB, disk: 120_000 },
  { name: "RuntimeBroker.exe", description: "Runtime Broker", company: "Microsoft Corporation", category: "windows", path: "C:\\Windows\\System32\\RuntimeBroker.exe", instances: 8, cpu: 0.02, ram: 23 * MB },
  { name: "audiodg.exe", description: "Windows Audio Device Graph Isolation", company: "Microsoft Corporation", category: "windows", path: "C:\\Windows\\System32\\audiodg.exe", instances: 1, cpu: 0.9, ram: 38 * MB },
  { name: "TaskManagerPlus.exe", description: "Task Manager+", company: "Task Manager+ contributors", category: "app", path: "C:\\Program Files\\Task Manager+\\TaskManagerPlus.exe", instances: 1, cpu: 0.6, ram: 92 * MB, window: "Task Manager+", signature: "unsigned" },
];

function wave(t: number, period: number, amplitude: number, phase = 0): number {
  return Math.sin((t / period) * Math.PI * 2 + phase) * amplitude;
}

function noise(scale: number): number {
  return (Math.random() - 0.5) * 2 * scale;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function sensor(name: string, kind: SensorReading["kind"], value: number): SensorReading {
  return { name, kind, value: Math.round(value * 10) / 10, min: value * 0.8, max: value * 1.2 };
}

export class MockTransport implements Transport {
  readonly isHost = false;
  private tick = 0;
  private settings: Settings = {
    closeToTray: true,
    startWithWindows: false,
    startMinimized: false,
    detailMode: false,
    retentionDays: 30,
    refreshIntervalMs: 1000,
    theme: "system",
    performanceMode: false,
    overlay: {
      enabled: false,
      edge: "top",
      size: "small",
      metrics: [
        { id: "cpu", show: "load" },
        { id: "gpu", show: "load" },
        { id: "ram", show: "load" },
      ],
    },
  };
  private autostart = mockAutostart();

  start(onSnapshot: (snapshot: Snapshot) => void): () => void {
    onSnapshot(this.snapshot());
    const timer = window.setInterval(() => onSnapshot(this.snapshot()), 1000);
    return () => window.clearInterval(timer);
  }

  notifyTheme(): void {}

  async request<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, 180));
    return this.handle(action, args) as T;
  }

  private handle(action: string, args: Record<string, unknown>): unknown {
    switch (action) {
      case "system.info":
        return {
          info: {
            computerName: "DESKTOP-DEMO",
            osName: "Windows 11 Pro",
            osVersion: "10.0.26200",
            motherboard: "Demo Motherboard",
            bios: "Demo BIOS 1.20",
            isElevated: true,
            sensorDriverAvailable: false,
            appVersion: "1.0.0",
          } satisfies SystemInfo,
          sensorDriverBundled: true,
        };
      case "sensors.installDriver":
        return { installed: false, info: null };
      case "settings.get":
        return this.settings;
      case "settings.set":
        this.settings = { ...this.settings, ...(args as Partial<Settings>) };
        return this.settings;
      case "overlay.displays":
        return [
          { id: "\\\\.\\DISPLAY1", index: 1, primary: true, width: 2560, height: 1440 },
          { id: "\\\\.\\DISPLAY2", index: 2, primary: false, width: 1920, height: 1080 },
        ];
      case "autostart.list":
        return this.autostart;
      case "autostart.set":
        this.autostart = this.autostart.map((e) => (e.id === args.id ? { ...e, enabled: Boolean(args.enabled) } : e));
        return null;
      case "services.list":
        return mockServices();
      case "network.connections":
        return mockConnections();
      case "history.query":
        return mockHistory(String(args.range ?? "1h"));
      case "history.top":
        return [
          { name: "chrome.exe", value: 6.4 },
          { name: "EpicGamesLauncher.exe", value: 3.1 },
          { name: "Discord.exe", value: 1.8 },
          { name: "dwm.exe", value: 1.2 },
        ];
      case "process.details":
        return { commandLine: "\"C:\\Program Files\\Example\\app.exe\" --type=renderer", priority: 8, owner: "DESKTOP-DEMO\\User" };
      default:
        return null;
    }
  }

  private snapshot(): Snapshot {
    const t = this.tick++;
    const processes = this.processes(t);
    const cpuTotal = clamp(processes.reduce((sum, p) => sum + p.cpu, 0));
    const logical = Array.from({ length: 16 }, (_, i) => clamp(cpuTotal + wave(t + i * 3, 11, 9) + noise(6)));
    const gpuLoad = clamp(20 + wave(t, 30, 6) + noise(2));
    const download = Math.max(0, 4_600_000 + wave(t, 20, 2_400_000) + noise(500_000));

    return {
      timestamp: new Date().toISOString(),
      summary: { processCount: 287, threadCount: 4213, handleCount: 131_880, uptimeSeconds: 93_000 + t, tracingActive: true, sensorDriverAvailable: false },
      cpus: [
        {
          id: "CPU0",
          name: "AMD Ryzen 7 7700 8-Core Processor",
          cores: 8,
          logicalProcessors: 16,
          utilization: cpuTotal,
          logicalLoads: logical,
          clockMhz: 4600 + wave(t, 9, 180),
          baseClockMhz: 4201,
          temperature: 58 + wave(t, 25, 4),
          packagePower: 48 + wave(t, 13, 9),
          l2CacheBytes: 8 * MB,
          l3CacheBytes: 32 * MB,
          sensors: [
            sensor("Core (Tctl/Tdie)", "temperature", 58 + wave(t, 25, 4)),
            sensor("Package", "power", 48 + wave(t, 13, 9)),
            ...Array.from({ length: 8 }, (_, i) => sensor(`Core #${i + 1}`, "clock", 4600 + wave(t + i, 9, 180))),
            sensor("CPU Total", "load", cpuTotal),
            sensor("Core (SVI3 TFN)", "voltage", 1.18),
          ],
        },
      ],
      gpus: [
        {
          id: NVIDIA,
          name: "NVIDIA GeForce RTX 3060",
          vendor: "NVIDIA",
          isIntegrated: false,
          utilization: gpuLoad,
          engines: { "3D": gpuLoad, Copy: clamp(2 + noise(1)), "Video Decode": clamp(1 + noise(0.5)) },
          dedicatedTotal: 12 * GB,
          dedicatedUsed: 2.7 * GB,
          sharedTotal: 16 * GB,
          sharedUsed: 0.3 * GB,
          temperature: 51 + wave(t, 40, 2),
          coreClockMhz: 2535,
          memoryClockMhz: 10501,
          power: 42 + wave(t, 12, 6),
          fanRpm: 0,
          sensors: [
            sensor("GPU Core", "temperature", 51 + wave(t, 40, 2)),
            sensor("GPU Hot Spot", "temperature", 63 + wave(t, 40, 2)),
            sensor("GPU Core", "clock", 2535),
            sensor("GPU Memory", "clock", 10501),
            sensor("GPU Package", "power", 42 + wave(t, 12, 6)),
            sensor("GPU Fan 1", "fan", 0),
            sensor("GPU Core", "load", gpuLoad),
            sensor("GPU Memory Used", "smallData", 2764),
          ],
        },
        {
          id: IGPU,
          name: "AMD Radeon(TM) Graphics",
          vendor: "AMD",
          isIntegrated: true,
          utilization: clamp(0.4 + noise(0.3)),
          engines: { "3D": clamp(0.4 + noise(0.3)) },
          dedicatedTotal: 512 * MB,
          dedicatedUsed: 22 * MB,
          sharedTotal: 16 * GB,
          sharedUsed: 40 * MB,
          coreClockMhz: 600,
          power: 22,
          sensors: [sensor("GPU Core", "clock", 600), sensor("GPU Package", "power", 22)],
        },
      ],
      memory: {
        installed: 32 * GB,
        total: 31.1 * GB,
        used: 15.1 * GB + wave(t, 60, 0.3 * GB),
        available: 16.9 * GB - wave(t, 60, 0.3 * GB),
        committed: 20.7 * GB,
        commitLimit: 36.8 * GB,
        cached: 11.2 * GB,
        pagedPool: 820 * MB,
        nonPagedPool: 540 * MB,
        speedMts: 5200,
        modules: [
          { slot: "DIMM 1", manufacturer: "Corsair", partNumber: "CMK32GX5M2B5200C40", capacity: 16 * GB, speedMts: 5200, formFactor: "DIMM" },
          { slot: "DIMM 2", manufacturer: "Corsair", partNumber: "CMK32GX5M2B5200C40", capacity: 16 * GB, speedMts: 5200, formFactor: "DIMM" },
        ],
        sensors: [sensor("Memory", "load", 47), sensor("Memory Used", "data", 15.1), sensor("Memory Available", "data", 16.9)],
      },
      disks: [
        {
          id: "disk0",
          index: 0,
          name: "Samsung SSD 980 PRO 1TB",
          mediaType: "SSD",
          busType: "NVMe",
          size: 1000 * GB,
          volumes: [{ letter: "C:", label: "System", fileSystem: "NTFS", total: 930 * GB, free: 412 * GB }],
          activePercent: clamp(4 + wave(t, 7, 3) + noise(2)),
          readBytesPerSec: Math.max(0, 1_200_000 + wave(t, 7, 900_000)),
          writeBytesPerSec: Math.max(0, 5_600_000 + wave(t, 17, 2_000_000)),
          averageResponseMs: 0.4,
          temperature: 44,
          lifeRemainingPercent: 98,
          sensors: [sensor("Temperature", "temperature", 44), sensor("Remaining Life", "level", 98), sensor("Data Written", "data", 12_400)],
        },
        {
          id: "disk1",
          index: 1,
          name: "Crucial P3 1TB",
          mediaType: "SSD",
          busType: "NVMe",
          size: 1000 * GB,
          volumes: [{ letter: "D:", label: "Games", fileSystem: "NTFS", total: 931 * GB, free: 188 * GB }],
          activePercent: clamp(0.3 + noise(0.3)),
          readBytesPerSec: 0,
          writeBytesPerSec: Math.max(0, 40_000 + noise(30_000)),
          averageResponseMs: 0.2,
          temperature: 39,
          lifeRemainingPercent: 100,
          sensors: [sensor("Temperature", "temperature", 39), sensor("Remaining Life", "level", 100)],
        },
      ],
      adapters: [
        {
          id: "{8C0E2A9D-0001}",
          name: "Ethernet",
          description: "Intel(R) Ethernet Controller I225-V",
          kind: "Ethernet",
          isUp: true,
          linkSpeedBitsPerSec: 1_000_000_000,
          macAddress: "02:00:5E:10:00:01",
          iPv4: ["192.168.1.50/24"],
          iPv6: ["fe80::1c2b:3aff:fe4d:5e6f%17"],
          gateways: ["192.168.1.1"],
          dnsServers: ["192.168.1.1"],
          dhcpEnabled: true,
          receiveBytesPerSec: download,
          sendBytesPerSec: Math.max(0, 180_000 + wave(t, 9, 90_000)),
          totalReceived: 48 * GB + t * download,
          totalSent: 3 * GB,
        },
        {
          id: "{8C0E2A9D-0002}",
          name: "WLAN",
          description: "Intel(R) Wi-Fi 6 AX201 160MHz",
          kind: "Wi-Fi",
          isUp: false,
          linkSpeedBitsPerSec: 0,
          macAddress: "02:00:5E:10:00:02",
          iPv4: [],
          iPv6: [],
          gateways: [],
          dnsServers: [],
          dhcpEnabled: true,
          receiveBytesPerSec: 0,
          sendBytesPerSec: 0,
          totalReceived: 0,
          totalSent: 0,
        },
      ],
      latency: {
        gatewayAddress: "192.168.1.1",
        gatewayMs: 1,
        internetTarget: "1.1.1.1",
        internetMs: Math.round(24 + Math.abs(wave(t, 8, 18)) + noise(4)),
        packetLossPercent: 0,
      },
      processes,
    };
  }

  private processes(t: number): ProcessSnapshot[] {
    const result: ProcessSnapshot[] = [];
    let pid = 1000;
    catalog.forEach((entry, entryIndex) => {
      const root = pid;
      for (let i = 0; i < entry.instances; i++) {
        const share = i === 0 ? 0.6 : 0.4 / Math.max(1, entry.instances - 1);
        const load = (value: number | undefined, scale = 1) =>
          value ? Math.max(0, (value + wave(t + entryIndex, 10 + entryIndex, value * 0.4) + noise(value * 0.2 * scale)) * share) : 0;
        const net = load(entry.net);
        result.push({
          pid: entry.name === "System" ? 4 : pid,
          parentPid: i === 0 ? 900 : root,
          groupId: entry.name === "System" ? 4 : root,
          name: entry.name,
          path: entry.path || undefined,
          description: entry.description || undefined,
          company: entry.company || undefined,
          category: entry.category,
          isCritical: Boolean(entry.critical),
          isSelf: entry.name === "TaskManagerPlus.exe",
          windowTitle: i === 0 ? entry.window : undefined,
          sessionId: entry.category === "windows" ? 0 : 1,
          startTime: new Date(Date.now() - (entryIndex + 1) * 3_600_000).toISOString(),
          cpu: clamp(load(entry.cpu)),
          workingSet: entry.ram * share,
          privateBytes: entry.ram * share * 1.2,
          threads: 12 + entryIndex * 3,
          handles: 300 + entryIndex * 41,
          diskReadBytesPerSec: load(entry.disk) * 0.3,
          diskWriteBytesPerSec: load(entry.disk) * 0.7,
          disks: entry.disk ? [{ diskIndex: 0, readBytesPerSec: load(entry.disk) * 0.3, writeBytesPerSec: load(entry.disk) * 0.7 }] : [],
          netReceiveBytesPerSec: net * 0.9,
          netSendBytesPerSec: net * 0.1,
          gpu: entry.gpu
            ? [{ adapterId: NVIDIA, utilization: clamp(load(entry.gpu)), engines: { "3D": clamp(load(entry.gpu)) }, dedicatedBytes: 180 * MB * share, sharedBytes: 20 * MB }]
            : [],
          signature: entry.signature ?? (entry.path ? "valid" : "unknown"),
          signer: entry.signature === "unsigned" ? undefined : entry.company || undefined,
          threat: entry.signature === "unsigned" && entry.name !== "TaskManagerPlus.exe" ? (entry.path.includes("\\Temp\\") ? "warning" : "notice") : "none",
          threatReasons:
            entry.signature === "unsigned" && entry.name !== "TaskManagerPlus.exe"
              ? entry.path.includes("\\Temp\\")
                ? ["unsignedInWritableFolder", "unsignedWithTraffic"]
                : ["unsigned"]
              : [],
        });
        pid += 4;
      }
    });
    return result;
  }
}

function mockAutostart(): AutostartEntry[] {
  const make = (name: string, command: string, publisher: string | undefined, source: AutostartEntry["source"], enabled: boolean, signature: AutostartEntry["signature"] = "valid"): AutostartEntry => ({
    id: `${source}|${name}`,
    name,
    command,
    imagePath: command.replace(/^"([^"]+)".*$/, "$1"),
    publisher,
    source,
    location: source === "scheduledTask" ? "\\" : "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
    enabled,
    canToggle: true,
    signature,
    isSelf: false,
  });
  return [
    make("Discord", "\"C:\\Users\\User\\AppData\\Local\\Discord\\Update.exe\" --processStart Discord.exe", "Discord Inc.", "registryUser", true),
    make("Steam", "\"C:\\Program Files (x86)\\Steam\\steam.exe\" -silent", "Valve Corp.", "registryUser", true),
    make("Spotify", "\"C:\\Users\\User\\AppData\\Roaming\\Spotify\\Spotify.exe\" --autostart --minimized", "Spotify AB", "registryUser", false),
    make("EpicGamesLauncher", "\"C:\\Program Files\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe\" -silent", "Epic Games Inc.", "registryUser", true),
    make("Corsair iCUE5 Software", "\"C:\\Program Files\\Corsair\\Corsair iCUE5 Software\\iCUE Launcher.exe\" --autorun", "Corsair Memory, Inc.", "registryMachine", true),
    make("SecurityHealth", "\"C:\\Windows\\system32\\SecurityHealthSystray.exe\"", "Microsoft Windows", "registryMachine", true),
    make("Updater", "\"C:\\Users\\User\\AppData\\Local\\Temp\\7zS4A1\\updater.exe\" /quiet", undefined, "registryUser", true, "unsigned"),
    make("Vendor Update Task", "\"C:\\Program Files\\Vendor\\update.exe\" /check", "Vendor Ltd.", "scheduledTask", true),
  ];
}

function mockServices(): ServiceEntry[] {
  const make = (name: string, displayName: string, status: string, startType: string, isMicrosoft: boolean, signer: string, description: string): ServiceEntry => ({
    name,
    displayName,
    description,
    status,
    startType,
    delayedStart: false,
    imagePath: `C:\\Program Files\\${displayName}\\service.exe`,
    pid: status === "Running" ? 4000 + name.length * 13 : undefined,
    account: "LocalSystem",
    isMicrosoft,
    canStop: status === "Running",
    signature: "valid",
    signer,
  });
  return [
    make("CorsairService", "Corsair Service", "Running", "Auto", false, "Corsair Memory, Inc.", "Hardware control for Corsair devices."),
    make("LGHUBUpdaterService", "Logitech G HUB Updater", "Running", "Auto", false, "Logitech Inc", "Keeps Logitech G HUB up to date."),
    make("NvContainerLocalSystem", "NVIDIA LocalSystem Container", "Running", "Auto", false, "NVIDIA Corporation", "Container service for NVIDIA root features."),
    make("EpicOnlineServices", "Epic Online Services", "Stopped", "Manual", false, "Epic Games Inc.", "Epic Online Services helper."),
    make("Spooler", "Print Spooler", "Running", "Auto", true, "Microsoft Windows", "Queues print jobs."),
    make("WSearch", "Windows Search", "Running", "Auto", true, "Microsoft Windows", "Indexes files and email for search."),
    make("DoSvc", "Delivery Optimization", "Running", "Auto", true, "Microsoft Windows", "Downloads Windows updates and shares them with other PCs."),
    make("wuauserv", "Windows Update", "Stopped", "Manual", true, "Microsoft Windows", "Detects, downloads and installs updates."),
  ];
}

function mockConnections(): ConnectionEntry[] {
  return [
    { protocol: "TCP", localAddress: "192.168.1.50", localPort: 51_234, remoteAddress: "104.18.125.108", remotePort: 443, state: "Established", pid: 1012, processName: "EpicGamesLauncher.exe" },
    { protocol: "TCP", localAddress: "192.168.1.50", localPort: 51_240, remoteAddress: "142.250.185.110", remotePort: 443, state: "Established", pid: 1000, processName: "chrome.exe" },
    { protocol: "TCP", localAddress: "192.168.1.50", localPort: 51_266, remoteAddress: "162.159.135.232", remotePort: 443, state: "Established", pid: 1036, processName: "Discord.exe" },
    { protocol: "TCP", localAddress: "192.168.1.50", localPort: 51_301, remoteAddress: "35.186.224.25", remotePort: 443, state: "Established", pid: 1060, processName: "Spotify.exe" },
    { protocol: "TCP", localAddress: "192.168.1.50", localPort: 51_377, remoteAddress: "185.199.108.133", remotePort: 443, state: "TimeWait", pid: 0, processName: "System" },
    { protocol: "TCP", localAddress: "0.0.0.0", localPort: 135, remoteAddress: "", remotePort: 0, state: "Listen", pid: 1140, processName: "svchost.exe" },
    { protocol: "TCP", localAddress: "0.0.0.0", localPort: 445, remoteAddress: "", remotePort: 0, state: "Listen", pid: 4, processName: "System" },
    { protocol: "UDP", localAddress: "0.0.0.0", localPort: 5353, remoteAddress: "", remotePort: 0, state: "Listen", pid: 1000, processName: "chrome.exe" },
  ];
}

function mockHistory(range: string): HistoryResponse {
  const spans: Record<string, [number, number]> = { "1h": [3600, 60], "6h": [21_600, 120], "24h": [86_400, 300], "7d": [604_800, 1800], "30d": [2_592_000, 7200] };
  const [span, bucket] = spans[range] ?? [3600, 60];
  const to = Math.floor(Date.now() / 1000);
  const from = to - span;
  const points = (base: number, amplitude: number, period: number) =>
    Array.from({ length: Math.floor(span / bucket) }, (_, i) => ({
      timestamp: from + i * bucket,
      value: Math.max(0, base + Math.sin(i / period) * amplitude + (Math.random() - 0.5) * amplitude * 0.4),
    }));
  return {
    from,
    to,
    bucket,
    series: {
      cpu: points(18, 12, 6),
      [`gpu:${NVIDIA}`]: points(22, 18, 9),
      [`gpu:${IGPU}`]: points(0.5, 0.4, 5),
      ram: points(47, 4, 20),
      "disk:0:read": points(1_500_000, 1_200_000, 4),
      "disk:0:write": points(4_000_000, 3_000_000, 5),
      "disk:1:read": points(100_000, 90_000, 3),
      "disk:1:write": points(50_000, 40_000, 3),
      "net:down": points(3_000_000, 2_800_000, 7),
      "net:up": points(200_000, 150_000, 7),
      "ping:internet": points(28, 10, 4),
      "ping:gateway": points(1, 0.4, 4),
      "temp:cpu": points(56, 6, 12),
      [`temp:gpu:${NVIDIA}`]: points(50, 5, 12),
    },
  };
}
