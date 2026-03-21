import { GlassCard, GlowPill, StitchButton } from "@/components/UI";

const mockDisks = [
  { name: "/dev/sda", label: "WD Red 4TB", temp: 34, health: 98, used: 72 },
  { name: "/dev/sdb", label: "Seagate IronWolf 8TB", temp: 36, health: 95, used: 45 },
  { name: "/dev/sdc", label: "WD Red 4TB", temp: 33, health: 99, used: 68 },
  { name: "/dev/sdd", label: "Parity Disk", temp: 35, health: 97, used: 81 },
];

function MetricValue({ value, unit }: { value: string | number; unit: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-display text-3xl font-bold text-teal">{value}</span>
      <span className="font-mono text-sm text-[var(--text-secondary)]">{unit}</span>
    </div>
  );
}

function DiskRow({ disk }: { disk: (typeof mockDisks)[0] }) {
  const healthStatus = disk.health >= 97 ? "healthy" : disk.health >= 90 ? "warning" : "error";
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-sm text-[var(--text-primary)]">{disk.name}</span>
        <span className="text-xs text-[var(--text-secondary)]">{disk.label}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-mono text-sm text-[var(--text-secondary)]">{disk.temp}°C</span>
        <div className="w-24">
          <div className="h-1.5 rounded-full bg-surface-void">
            <div
              className="h-1.5 rounded-full bg-teal transition-all duration-500"
              style={{ width: `${disk.used}%` }}
            />
          </div>
          <span className="font-mono text-xs text-[var(--text-secondary)]">{disk.used}%</span>
        </div>
        <GlowPill status={healthStatus} label={`${disk.health}%`} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-surface p-stitch-6 lg:p-stitch-10">
      {/* Header */}
      <header className="mb-stitch-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            HomePiNAS
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">The Kinetic Observatory</p>
        </div>
        <div className="flex items-center gap-3">
          <GlowPill status="healthy" label="All Systems" />
          <StitchButton size="sm">Settings</StitchButton>
        </div>
      </header>

      {/* Metrics row */}
      <div className="mb-stitch-6 grid grid-cols-1 gap-stitch-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            CPU Usage
          </p>
          <MetricValue value="23" unit="%" />
        </GlassCard>

        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            Memory
          </p>
          <MetricValue value="2.1" unit="GB / 4 GB" />
        </GlassCard>

        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            Network ↓
          </p>
          <MetricValue value="45.2" unit="MB/s" />
        </GlassCard>

        <GlassCard elevation="mid">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            Uptime
          </p>
          <MetricValue value="47" unit="days" />
        </GlassCard>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-stitch-6 lg:grid-cols-3">
        {/* Disk Health — spans 2 cols */}
        <GlassCard elevation="low" className="lg:col-span-2">
          <h2 className="mb-stitch-6 font-display text-lg font-semibold text-[var(--text-primary)]">
            Disk Array
          </h2>
          <div className="divide-y divide-[var(--outline-variant)]">
            {mockDisks.map((disk) => (
              <DiskRow key={disk.name} disk={disk} />
            ))}
          </div>
        </GlassCard>

        {/* Quick Actions */}
        <GlassCard elevation="high">
          <h2 className="mb-stitch-6 font-display text-lg font-semibold text-[var(--text-primary)]">
            Quick Actions
          </h2>
          <div className="flex flex-col gap-3">
            <StitchButton variant="primary">
              SnapRAID Sync
            </StitchButton>
            <StitchButton variant="ghost">
              SMART Check
            </StitchButton>
            <StitchButton variant="ghost">
              MergerFS Status
            </StitchButton>
            <StitchButton variant="ghost">
              Docker Containers
            </StitchButton>
          </div>
        </GlassCard>

        {/* Services */}
        <GlassCard elevation="mid" className="lg:col-span-2">
          <h2 className="mb-stitch-6 font-display text-lg font-semibold text-[var(--text-primary)]">
            Services
          </h2>
          <div className="grid grid-cols-2 gap-stitch-4 sm:grid-cols-3">
            {["Samba", "SSH", "Docker", "Portainer", "Nginx", "Tailscale"].map((svc) => (
              <div key={svc} className="surface-sunken flex items-center justify-between">
                <span className="font-mono text-sm">{svc}</span>
                <GlowPill status="healthy" label="UP" />
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Node Info */}
        <GlassCard elevation="mid" pulse>
          <h2 className="mb-stitch-6 font-display text-lg font-semibold text-[var(--text-primary)]">
            Active Node
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-[var(--text-secondary)]">Hostname</span>
              <span className="font-mono text-sm">homepinas</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[var(--text-secondary)]">IP</span>
              <span className="font-mono text-sm">192.168.1.81</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[var(--text-secondary)]">Kernel</span>
              <span className="font-mono text-sm">6.6.28-rpi</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[var(--text-secondary)]">OS</span>
              <span className="font-mono text-sm">Debian 12</span>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Footer */}
      <footer className="mt-stitch-10 text-center text-xs text-[var(--text-disabled)]">
        HomePiNAS v3.6.0 · Luminous Obsidian · Built with Stitch Design System
      </footer>
    </div>
  );
}
