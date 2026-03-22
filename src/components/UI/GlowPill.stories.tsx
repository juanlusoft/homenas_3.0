import type { Meta, StoryObj } from "@storybook/react";
import { GlowPill } from "./GlowPill";

const meta: Meta<typeof GlowPill> = {
  title: "UI/GlowPill",
  component: GlowPill,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    status: {
      control: { type: "select" },
      options: ["healthy", "warning", "error", "info"],
    },
    label: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    status: "healthy",
    label: "Online",
  },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <GlowPill status="healthy" label="Healthy" />
      <GlowPill status="warning" label="Warning" />
      <GlowPill status="error" label="Error" />
      <GlowPill status="info" label="Info" />
    </div>
  ),
};

export const Warning: Story = {
  args: {
    status: "warning",
    label: "High CPU",
  },
};

export const Error: Story = {
  args: {
    status: "error",
    label: "Offline",
  },
};

export const Info: Story = {
  args: {
    status: "info",
    label: "Syncing",
  },
};
