import type { Meta, StoryObj } from "@storybook/react";
import { StitchButton } from "./StitchButton";

const meta: Meta<typeof StitchButton> = {
  title: "UI/StitchButton",
  component: StitchButton,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["primary", "ghost"],
    },
    size: {
      control: { type: "select" },
      options: ["sm", "md", "lg"],
    },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: "primary",
    size: "md",
    children: "Click me",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 items-center">
        <StitchButton variant="primary" size="sm">Primary SM</StitchButton>
        <StitchButton variant="primary" size="md">Primary MD</StitchButton>
        <StitchButton variant="primary" size="lg">Primary LG</StitchButton>
      </div>
      <div className="flex gap-3 items-center">
        <StitchButton variant="ghost" size="sm">Ghost SM</StitchButton>
        <StitchButton variant="ghost" size="md">Ghost MD</StitchButton>
        <StitchButton variant="ghost" size="lg">Ghost LG</StitchButton>
      </div>
    </div>
  ),
};

export const Ghost: Story = {
  args: {
    variant: "ghost",
    size: "md",
    children: "Ghost Button",
  },
};

export const Disabled: Story = {
  args: {
    variant: "primary",
    size: "md",
    children: "Disabled",
    disabled: true,
  },
};
