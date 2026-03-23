import type { Meta, StoryObj } from "@storybook/react-vite";
import { GlassCard } from "./GlassCard";

const meta: Meta<typeof GlassCard> = {
  title: "UI/GlassCard",
  component: GlassCard,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    elevation: {
      control: { type: "select" },
      options: ["low", "mid", "high", "glass"],
    },
    pulse: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    elevation: "mid",
    pulse: false,
    children: "Default GlassCard content",
  },
};

export const Elevations: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(["low", "mid", "high", "glass"] as const).map((level) => (
        <GlassCard key={level} elevation={level}>
          <p className="text-white text-sm font-medium">
            Elevation: <code>{level}</code>
          </p>
        </GlassCard>
      ))}
    </div>
  ),
};

export const WithPulse: Story = {
  args: {
    elevation: "glass",
    pulse: true,
    children: "Pulsing glass card — active node indicator",
  },
};

export const AsContainer: Story = {
  render: () => (
    <GlassCard elevation="high" className="max-w-sm">
      <h3 className="text-white text-lg font-semibold mb-2">System Status</h3>
      <p className="text-gray-400 text-sm">CPU: 45% · RAM: 6.2/16 GB</p>
    </GlassCard>
  ),
};
