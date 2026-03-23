import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectionStatus } from "./ConnectionStatus";

const meta: Meta<typeof ConnectionStatus> = {
  title: "SystemMonitor/ConnectionStatus",
  component: ConnectionStatus,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {
  args: {
    isConnected: true,
    connectionError: null,
    reconnectAttempts: 0,
  },
};

export const Reconnecting: Story = {
  args: {
    isConnected: false,
    connectionError: null,
    reconnectAttempts: 3,
  },
};

export const Disconnected: Story = {
  args: {
    isConnected: false,
    connectionError: "Connection refused",
    reconnectAttempts: 0,
  },
};

export const Connecting: Story = {
  args: {
    isConnected: false,
    connectionError: null,
    reconnectAttempts: 0,
  },
};

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <ConnectionStatus isConnected={true} connectionError={null} reconnectAttempts={0} />
      <ConnectionStatus isConnected={false} connectionError={null} reconnectAttempts={3} />
      <ConnectionStatus isConnected={false} connectionError="ECONNREFUSED" reconnectAttempts={0} />
      <ConnectionStatus isConnected={false} connectionError={null} reconnectAttempts={0} />
    </div>
  ),
};
