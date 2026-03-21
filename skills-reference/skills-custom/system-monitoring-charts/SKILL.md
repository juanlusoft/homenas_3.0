---
name: system-monitoring-charts
description: System monitoring charts and visualizations for NAS, server, and IoT dashboards. Covers CPU, memory, disk, network metrics with Chart.js, Recharts, and custom React components. Includes real-time updates, responsive design, and performance optimization.
---

# System Monitoring Charts

Professional system monitoring charts and visualizations for dashboards, NAS interfaces, and server monitoring applications.

## Use this skill when

- Building NAS or server monitoring dashboards
- Creating system health visualization panels
- Implementing real-time metrics charts (CPU, RAM, disk, network)
- Building IoT device monitoring interfaces
- Creating performance monitoring tools
- Implementing capacity planning visualizations
- Building alert threshold indicators
- Creating system resource utilization reports
- Building infrastructure monitoring dashboards
- Implementing hardware sensor visualizations

## Top 10 Use Cases (Based on Production Systems)

### 1. **CPU Utilization Charts**
Real-time CPU usage with multi-core support

```typescript
// CPUChart.tsx
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

interface CPUData {
  timestamp: number
  overall: number
  cores: number[]
}

interface CPUChartProps {
  data: CPUData[]
  theme?: 'light' | 'dark'
}

export const CPUChart: React.FC<CPUChartProps> = ({ data, theme = 'dark' }) => {
  const chartData = {
    labels: data.map(d => new Date(d.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'Overall CPU',
        data: data.map(d => d.overall),
        borderColor: '#44e5c2',
        backgroundColor: 'rgba(68, 229, 194, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
      },
      ...data[0]?.cores.map((_, index) => ({
        label: `Core ${index + 1}`,
        data: data.map(d => d.cores[index]),
        borderColor: `hsl(${(index * 60) % 360}, 70%, 60%)`,
        backgroundColor: `hsla(${(index * 60) % 360}, 70%, 60%, 0.1)`,
        borderWidth: 1,
        fill: false,
        tension: 0.4,
      })) || []
    ]
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: theme === 'dark' ? '#dfe2eb' : '#333',
          font: { family: 'JetBrains Mono', size: 12 }
        }
      },
      title: {
        display: true,
        text: 'CPU Usage (%)',
        color: theme === 'dark' ? '#dfe2eb' : '#333',
        font: { family: 'Space Grotesk', size: 16, weight: 'bold' }
      },
      tooltip: {
        backgroundColor: theme === 'dark' ? '#1c2026' : '#ffffff',
        titleColor: theme === 'dark' ? '#dfe2eb' : '#333',
        bodyColor: theme === 'dark' ? '#dfe2eb' : '#333',
        borderColor: theme === 'dark' ? '#3c4a45' : '#e5e5e5',
        borderWidth: 1
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        grid: {
          color: theme === 'dark' ? '#262a31' : '#f0f0f0'
        },
        ticks: {
          color: theme === 'dark' ? '#b0aea5' : '#666',
          font: { family: 'JetBrains Mono' },
          callback: (value) => `${value}%`
        }
      },
      x: {
        grid: {
          color: theme === 'dark' ? '#262a31' : '#f0f0f0'
        },
        ticks: {
          color: theme === 'dark' ? '#b0aea5' : '#666',
          font: { family: 'JetBrains Mono' },
          maxTicksLimit: 10
        }
      }
    },
    elements: {
      point: {
        radius: 0,
        hoverRadius: 6
      }
    }
  }

  return (
    <div className="h-64 w-full">
      <Line data={chartData} options={options} />
    </div>
  )
}
```

### 2. **Memory Usage Visualization**
Memory usage with swap and buffer details

```typescript
// MemoryChart.tsx
import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

interface MemoryData {
  used: number
  free: number
  cached: number
  buffers: number
  swap: {
    used: number
    total: number
  }
}

export const MemoryChart: React.FC<{ data: MemoryData; theme?: 'light' | 'dark' }> = ({ 
  data, 
  theme = 'dark' 
}) => {
  const total = data.used + data.free + data.cached + data.buffers
  const usedPercent = ((data.used / total) * 100).toFixed(1)
  const swapPercent = ((data.swap.used / data.swap.total) * 100).toFixed(1)

  const chartData = {
    labels: ['Used', 'Free', 'Cached', 'Buffers'],
    datasets: [
      {
        data: [data.used, data.free, data.cached, data.buffers],
        backgroundColor: [
          '#ff6b6b', // Used - Red
          '#44e5c2', // Free - Teal
          '#4ecdc4', // Cached - Light teal
          '#45b7d1'  // Buffers - Blue
        ],
        borderColor: theme === 'dark' ? '#1c2026' : '#ffffff',
        borderWidth: 3
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: theme === 'dark' ? '#dfe2eb' : '#333',
          font: { family: 'Manrope', size: 12 },
          padding: 20
        }
      },
      tooltip: {
        backgroundColor: theme === 'dark' ? '#1c2026' : '#ffffff',
        titleColor: theme === 'dark' ? '#dfe2eb' : '#333',
        bodyColor: theme === 'dark' ? '#dfe2eb' : '#333',
        callbacks: {
          label: (context: any) => {
            const value = context.parsed
            const percent = ((value / total) * 100).toFixed(1)
            return `${context.label}: ${(value / (1024**3)).toFixed(2)} GB (${percent}%)`
          }
        }
      }
    },
    cutout: '60%',
    elements: {
      arc: {
        borderRadius: 4
      }
    }
  }

  return (
    <div className="relative">
      <div className="h-64 w-full">
        <Doughnut data={chartData} options={options} />
      </div>
      
      {/* Center Stats */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-primary font-mono">
            {usedPercent}%
          </div>
          <div className="text-sm text-muted-foreground font-mono">
            RAM Used
          </div>
          {data.swap.total > 0 && (
            <div className="mt-2 text-xs text-muted-foreground font-mono">
              Swap: {swapPercent}%
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

### 3. **Disk Usage Indicators**
Disk space with health status

```typescript
// DiskChart.tsx
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface DiskData {
  mount: string
  used: number
  total: number
  filesystem: string
  health: 'healthy' | 'warning' | 'critical'
  temperature?: number
  readSpeed: number
  writeSpeed: number
}

export const DiskChart: React.FC<{ disks: DiskData[]; theme?: 'light' | 'dark' }> = ({ 
  disks, 
  theme = 'dark' 
}) => {
  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy': return '#44e5c2'
      case 'warning': return '#f59e0b'
      case 'critical': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const chartData = {
    labels: disks.map(d => d.mount),
    datasets: [
      {
        label: 'Used Space (%)',
        data: disks.map(d => (d.used / d.total) * 100),
        backgroundColor: disks.map(d => getHealthColor(d.health)),
        borderColor: disks.map(d => getHealthColor(d.health)),
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: true,
        text: 'Disk Usage',
        color: theme === 'dark' ? '#dfe2eb' : '#333',
        font: { family: 'Space Grotesk', size: 16, weight: 'bold' }
      },
      tooltip: {
        backgroundColor: theme === 'dark' ? '#1c2026' : '#ffffff',
        titleColor: theme === 'dark' ? '#dfe2eb' : '#333',
        bodyColor: theme === 'dark' ? '#dfe2eb' : '#333',
        callbacks: {
          title: (items: any[]) => {
            const disk = disks[items[0].dataIndex]
            return `${disk.mount} (${disk.filesystem})`
          },
          afterLabel: (item: any) => {
            const disk = disks[item.dataIndex]
            return [
              `Used: ${(disk.used / (1024**3)).toFixed(2)} GB`,
              `Total: ${(disk.total / (1024**3)).toFixed(2)} GB`,
              `Health: ${disk.health}`,
              disk.temperature ? `Temp: ${disk.temperature}°C` : '',
              `Read: ${disk.readSpeed} MB/s`,
              `Write: ${disk.writeSpeed} MB/s`
            ].filter(Boolean)
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        grid: {
          color: theme === 'dark' ? '#262a31' : '#f0f0f0'
        },
        ticks: {
          color: theme === 'dark' ? '#b0aea5' : '#666',
          font: { family: 'JetBrains Mono' },
          callback: (value: any) => `${value}%`
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: theme === 'dark' ? '#b0aea5' : '#666',
          font: { family: 'JetBrains Mono' }
        }
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="h-64 w-full">
        <Bar data={chartData} options={options} />
      </div>
      
      {/* Disk Details Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              <th className="text-left p-2 font-mono">Mount</th>
              <th className="text-left p-2 font-mono">Used/Total</th>
              <th className="text-left p-2 font-mono">Health</th>
              <th className="text-left p-2 font-mono">I/O</th>
            </tr>
          </thead>
          <tbody>
            {disks.map((disk, index) => (
              <tr key={index} className="border-b border-surface-container-low">
                <td className="p-2 font-mono text-xs">{disk.mount}</td>
                <td className="p-2 font-mono text-xs">
                  {(disk.used / (1024**3)).toFixed(1)}GB / {(disk.total / (1024**3)).toFixed(1)}GB
                </td>
                <td className="p-2">
                  <span 
                    className="px-2 py-1 rounded text-xs font-mono"
                    style={{ backgroundColor: `${getHealthColor(disk.health)}20`, color: getHealthColor(disk.health) }}
                  >
                    {disk.health}
                  </span>
                </td>
                <td className="p-2 font-mono text-xs">
                  R:{disk.readSpeed} W:{disk.writeSpeed} MB/s
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

### 4. **Network Traffic Visualization**
Real-time network I/O charts

```typescript
// NetworkChart.tsx
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface NetworkData {
  timestamp: number
  interfaces: Record<string, {
    rx: number // bytes received
    tx: number // bytes transmitted
    rxPackets: number
    txPackets: number
    errors: number
  }>
}

export const NetworkChart: React.FC<{ 
  data: NetworkData[]
  selectedInterface: string
  theme?: 'light' | 'dark' 
}> = ({ data, selectedInterface, theme = 'dark' }) => {
  
  const formatBytes = (bytes: number) => {
    if (bytes >= 1024**3) return `${(bytes / 1024**3).toFixed(1)} GB/s`
    if (bytes >= 1024**2) return `${(bytes / 1024**2).toFixed(1)} MB/s`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB/s`
    return `${bytes} B/s`
  }

  const chartData = {
    labels: data.map(d => new Date(d.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'Download (RX)',
        data: data.map(d => d.interfaces[selectedInterface]?.rx || 0),
        borderColor: '#44e5c2',
        backgroundColor: 'rgba(68, 229, 194, 0.1)',
        borderWidth: 2,
        fill: 'origin',
        tension: 0.4,
      },
      {
        label: 'Upload (TX)',
        data: data.map(d => d.interfaces[selectedInterface]?.tx || 0),
        borderColor: '#ff6b6b',
        backgroundColor: 'rgba(255, 107, 107, 0.1)',
        borderWidth: 2,
        fill: 'origin',
        tension: 0.4,
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: theme === 'dark' ? '#dfe2eb' : '#333',
          font: { family: 'Manrope', size: 12 }
        }
      },
      title: {
        display: true,
        text: `Network Traffic - ${selectedInterface}`,
        color: theme === 'dark' ? '#dfe2eb' : '#333',
        font: { family: 'Space Grotesk', size: 16, weight: 'bold' }
      },
      tooltip: {
        backgroundColor: theme === 'dark' ? '#1c2026' : '#ffffff',
        titleColor: theme === 'dark' ? '#dfe2eb' : '#333',
        bodyColor: theme === 'dark' ? '#dfe2eb' : '#333',
        callbacks: {
          label: (context: any) => {
            return `${context.dataset.label}: ${formatBytes(context.parsed.y)}`
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        stacked: false,
        grid: {
          color: theme === 'dark' ? '#262a31' : '#f0f0f0'
        },
        ticks: {
          color: theme === 'dark' ? '#b0aea5' : '#666',
          font: { family: 'JetBrains Mono' },
          callback: (value: any) => formatBytes(value)
        }
      },
      x: {
        grid: {
          color: theme === 'dark' ? '#262a31' : '#f0f0f0'
        },
        ticks: {
          color: theme === 'dark' ? '#b0aea5' : '#666',
          font: { family: 'JetBrains Mono' },
          maxTicksLimit: 10
        }
      }
    },
    elements: {
      point: {
        radius: 0,
        hoverRadius: 4
      }
    }
  }

  const currentData = data[data.length - 1]?.interfaces[selectedInterface]
  const currentRx = formatBytes(currentData?.rx || 0)
  const currentTx = formatBytes(currentData?.tx || 0)

  return (
    <div className="space-y-4">
      <div className="h-64 w-full">
        <Line data={chartData} options={options} />
      </div>
      
      {/* Current Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-container p-3 rounded-lg">
          <div className="text-xs text-muted-foreground">Download</div>
          <div className="text-lg font-mono font-bold text-primary">{currentRx}</div>
        </div>
        <div className="bg-surface-container p-3 rounded-lg">
          <div className="text-xs text-muted-foreground">Upload</div>
          <div className="text-lg font-mono font-bold text-red-500">{currentTx}</div>
        </div>
        <div className="bg-surface-container p-3 rounded-lg">
          <div className="text-xs text-muted-foreground">RX Packets</div>
          <div className="text-lg font-mono font-bold">{currentData?.rxPackets || 0}</div>
        </div>
        <div className="bg-surface-container p-3 rounded-lg">
          <div className="text-xs text-muted-foreground">Errors</div>
          <div className="text-lg font-mono font-bold text-orange-500">{currentData?.errors || 0}</div>
        </div>
      </div>
    </div>
  )
}
```

### 5. **Temperature Monitoring**
Hardware temperature gauges

```typescript
// TemperatureGauge.tsx
import { useEffect, useRef } from 'react'

interface TemperatureGaugeProps {
  value: number
  max: number
  label: string
  unit?: string
  thresholds?: {
    warning: number
    critical: number
  }
  size?: number
}

export const TemperatureGauge: React.FC<TemperatureGaugeProps> = ({
  value,
  max,
  label,
  unit = '°C',
  thresholds = { warning: 70, critical: 85 },
  size = 120
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, size, size)

    const centerX = size / 2
    const centerY = size / 2
    const radius = size * 0.35
    const startAngle = Math.PI * 0.75 // Start at 135 degrees
    const endAngle = Math.PI * 0.25   // End at 45 degrees (270 degrees total)
    
    // Calculate angle for current value
    const valueAngle = startAngle + ((value / max) * (endAngle - startAngle + 2 * Math.PI))

    // Draw background arc
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, startAngle, endAngle + 2 * Math.PI)
    ctx.strokeStyle = '#262a31'
    ctx.lineWidth = 8
    ctx.stroke()

    // Draw threshold zones
    const warningAngle = startAngle + ((thresholds.warning / max) * (endAngle - startAngle + 2 * Math.PI))
    const criticalAngle = startAngle + ((thresholds.critical / max) * (endAngle - startAngle + 2 * Math.PI))

    // Green zone (0 to warning)
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, startAngle, warningAngle)
    ctx.strokeStyle = '#44e5c2'
    ctx.lineWidth = 8
    ctx.stroke()

    // Yellow zone (warning to critical)
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, warningAngle, criticalAngle)
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 8
    ctx.stroke()

    // Red zone (critical to max)
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, criticalAngle, endAngle + 2 * Math.PI)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 8
    ctx.stroke()

    // Draw value arc
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, startAngle, valueAngle)
    ctx.strokeStyle = value >= thresholds.critical ? '#ef4444' : 
                      value >= thresholds.warning ? '#f59e0b' : '#44e5c2'
    ctx.lineWidth = 4
    ctx.stroke()

    // Draw needle
    const needleX = centerX + Math.cos(valueAngle) * radius
    const needleY = centerY + Math.sin(valueAngle) * radius
    
    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.lineTo(needleX, needleY)
    ctx.strokeStyle = '#dfe2eb'
    ctx.lineWidth = 2
    ctx.stroke()

    // Draw center dot
    ctx.beginPath()
    ctx.arc(centerX, centerY, 4, 0, 2 * Math.PI)
    ctx.fillStyle = '#dfe2eb'
    ctx.fill()

    // Draw value text
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#dfe2eb'
    ctx.font = 'bold 16px JetBrains Mono'
    ctx.fillText(`${value}${unit}`, centerX, centerY + 25)

  }, [value, max, thresholds, size])

  const getStatusColor = () => {
    if (value >= thresholds.critical) return 'text-red-500'
    if (value >= thresholds.warning) return 'text-yellow-500'
    return 'text-green-500'
  }

  return (
    <div className="flex flex-col items-center space-y-2">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="drop-shadow-lg"
      />
      <div className="text-center">
        <div className="text-sm font-mono text-muted-foreground">{label}</div>
        <div className={`text-xs font-mono ${getStatusColor()}`}>
          {value >= thresholds.critical ? 'Critical' : 
           value >= thresholds.warning ? 'Warning' : 'Normal'}
        </div>
      </div>
    </div>
  )
}
```

### 6. **Process/Service Monitor**
Running processes and services status

```typescript
// ProcessMonitor.tsx
interface Process {
  pid: number
  name: string
  cpu: number
  memory: number
  status: 'running' | 'stopped' | 'error'
  uptime: number
  user: string
}

interface Service {
  name: string
  status: 'active' | 'inactive' | 'failed'
  enabled: boolean
  description: string
  memory?: number
  restarts: number
}

export const ProcessMonitor: React.FC<{ 
  processes: Process[]
  services: Service[]
  onKillProcess: (pid: number) => void
  onRestartService: (name: string) => void
}> = ({ processes, services, onKillProcess, onRestartService }) => {
  
  const getStatusBadge = (status: string) => {
    const colors = {
      running: 'bg-green-500/20 text-green-500',
      active: 'bg-green-500/20 text-green-500',
      stopped: 'bg-gray-500/20 text-gray-500',
      inactive: 'bg-gray-500/20 text-gray-500',
      error: 'bg-red-500/20 text-red-500',
      failed: 'bg-red-500/20 text-red-500'
    }
    return colors[status as keyof typeof colors] || colors.error
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / (24 * 3600))
    const hours = Math.floor((seconds % (24 * 3600)) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  return (
    <div className="space-y-6">
      {/* Services Table */}
      <div>
        <h3 className="text-lg font-semibold mb-3 font-display">System Services</h3>
        <div className="bg-surface-container rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-container-high">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-mono font-medium uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-medium uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-medium uppercase tracking-wider">
                    Memory
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-medium uppercase tracking-wider">
                    Restarts
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-medium uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low">
                {services.map((service, index) => (
                  <tr key={index} className="hover:bg-surface-container-low/50">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-mono text-sm font-medium">{service.name}</div>
                        <div className="text-xs text-muted-foreground">{service.description}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(service.status)}`}>
                        {service.status}
                      </span>
                      {service.enabled && (
                        <span className="ml-2 text-xs text-muted-foreground">(enabled)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">
                      {service.memory ? `${(service.memory / 1024 / 1024).toFixed(1)} MB` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">
                      {service.restarts}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onRestartService(service.name)}
                        className="text-xs bg-primary/20 text-primary px-2 py-1 rounded hover:bg-primary/30 font-mono"
                        disabled={service.status === 'failed'}
                      >
                        Restart
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Top Processes */}
      <div>
        <h3 className="text-lg font-semibold mb-3 font-display">Top Processes</h3>
        <div className="bg-surface-container rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-container-high">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-mono font-medium uppercase tracking-wider">
                    PID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-medium uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-medium uppercase tracking-wider">
                    CPU %
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-medium uppercase tracking-wider">
                    Memory
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-medium uppercase tracking-wider">
                    Uptime
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-medium uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-medium uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low">
                {processes
                  .sort((a, b) => b.cpu - a.cpu)
                  .slice(0, 10)
                  .map((process, index) => (
                  <tr key={process.pid} className="hover:bg-surface-container-low/50">
                    <td className="px-4 py-3 text-sm font-mono">{process.pid}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm">{process.name}</span>
                        <span className={`w-2 h-2 rounded-full ${getStatusBadge(process.status).includes('green') ? 'bg-green-500' : getStatusBadge(process.status).includes('red') ? 'bg-red-500' : 'bg-gray-500'}`} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-mono">{process.cpu.toFixed(1)}%</span>
                        <div className="w-12 bg-surface-container-low rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(process.cpu, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">
                      {(process.memory / 1024 / 1024).toFixed(1)} MB
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">
                      {formatUptime(process.uptime)}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">{process.user}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onKillProcess(process.pid)}
                        className="text-xs bg-red-500/20 text-red-500 px-2 py-1 rounded hover:bg-red-500/30 font-mono"
                        disabled={process.status !== 'running'}
                      >
                        Kill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
```

### 7-10. **Additional Chart Components**

```typescript
// SystemOverview.tsx - Combined dashboard with all metrics
export const SystemOverviewDashboard: React.FC<{
  cpuData: CPUData[]
  memoryData: MemoryData
  diskData: DiskData[]
  networkData: NetworkData[]
  temperatureData: { cpu: number; gpu?: number; motherboard?: number }
  processes: Process[]
  services: Service[]
  theme?: 'light' | 'dark'
}> = ({ cpuData, memoryData, diskData, networkData, temperatureData, processes, services, theme = 'dark' }) => {
  
  const [selectedInterface, setSelectedInterface] = useState('eth0')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 p-6">
      {/* CPU Chart */}
      <div className="bg-surface-container rounded-lg p-6">
        <CPUChart data={cpuData} theme={theme} />
      </div>

      {/* Memory Chart */}
      <div className="bg-surface-container rounded-lg p-6">
        <MemoryChart data={memoryData} theme={theme} />
      </div>

      {/* Temperature Gauges */}
      <div className="bg-surface-container rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 font-display">Temperature</h3>
        <div className="flex justify-around">
          <TemperatureGauge 
            value={temperatureData.cpu} 
            max={100} 
            label="CPU" 
            thresholds={{ warning: 70, critical: 85 }}
          />
          {temperatureData.gpu && (
            <TemperatureGauge 
              value={temperatureData.gpu} 
              max={100} 
              label="GPU" 
              thresholds={{ warning: 80, critical: 95 }}
            />
          )}
        </div>
      </div>

      {/* Network Chart */}
      <div className="lg:col-span-2 bg-surface-container rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold font-display">Network Traffic</h3>
          <select 
            value={selectedInterface} 
            onChange={(e) => setSelectedInterface(e.target.value)}
            className="bg-surface-container-high border border-outline-variant rounded px-3 py-1 text-sm"
          >
            <option value="eth0">eth0</option>
            <option value="wlan0">wlan0</option>
            <option value="docker0">docker0</option>
          </select>
        </div>
        <NetworkChart data={networkData} selectedInterface={selectedInterface} theme={theme} />
      </div>

      {/* Disk Chart */}
      <div className="bg-surface-container rounded-lg p-6">
        <DiskChart disks={diskData} theme={theme} />
      </div>

      {/* Process Monitor */}
      <div className="xl:col-span-3 bg-surface-container rounded-lg p-6">
        <ProcessMonitor 
          processes={processes} 
          services={services}
          onKillProcess={(pid) => console.log('Kill process:', pid)}
          onRestartService={(name) => console.log('Restart service:', name)}
        />
      </div>
    </div>
  )
}
```

## Integration Patterns

### Real-time Data Hook
```typescript
// useSystemMonitoring.ts
export const useSystemMonitoring = () => {
  const [metrics, setMetrics] = useState<SystemMetrics>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080/metrics')
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setMetrics(prev => ({
          ...prev,
          [data.type]: data.payload
        }))
        setIsLoading(false)
      } catch (err) {
        setError('Failed to parse metrics data')
      }
    }

    ws.onerror = () => {
      setError('WebSocket connection failed')
    }

    return () => ws.close()
  }, [])

  return { metrics, isLoading, error }
}
```

This skill provides comprehensive system monitoring charts suitable for NAS dashboards, server monitoring, and IoT applications with modern React patterns and responsive design.