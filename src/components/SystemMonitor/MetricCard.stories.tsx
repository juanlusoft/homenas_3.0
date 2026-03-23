import type { Meta, StoryObj } from "@storybook/react-vite";
import { MetricCard } from "./MetricCard";

const meta: Meta<typeof MetricCard> = {
  title: "SystemMonitor/MetricCard",
  component: MetricCard,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    trend: {
      control: { type: "select" },
      options: ["up", "down", "stable"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "CPU",
    value: "45",
    unit: "%",
    trend: "stable",
  },
};

export const AllTrends: Story = {
  render: () => (
    <div className="flex gap-4">
      <MetricCard title="CPU" value="78" unit="%" trend="up" icon="🔥" />
      <MetricCard title="Memory" value="6.2" unit="GB" trend="stable" icon="💾" />
      <MetricCard title="Temp" value="42" unit="°C" trend="down" icon="🌡️" />
    </div>
  ),
};

export const WithIcon: Story = {
  args: {
    title: "Network",
    value: "125",
    unit: "MB/s",
    trend: "up",
    icon: "🌐",
  },
};

export const DiskUsage: Story = {
  args: {
    title: "Disk",
    value: "1.8",
    unit: "TB",
    trend: "stable",
    icon: "💿",
  },
};
