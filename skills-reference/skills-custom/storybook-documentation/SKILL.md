---
name: storybook-documentation
description: Automate Storybook setup and component documentation for React+TypeScript projects. Use when setting up design systems, component libraries, or need automated documentation generation. Covers Vite integration, TypeScript support, and modern Storybook patterns.
---

# Storybook Documentation Automation

Automate Storybook setup and component documentation for React+TypeScript projects with modern best practices.

## Use this skill when

- Setting up Storybook for React+TypeScript+Vite projects
- Creating component libraries with automated documentation
- Building design systems that need visual documentation
- Integrating Storybook with existing projects
- Setting up accessibility testing in Storybook
- Creating component story templates and patterns
- Configuring design token integration
- Setting up visual regression testing

## Top 10 Use Cases (Based on Industry Research)

### 1. **Auto-Setup for Vite+React+TypeScript**
Most common: Initialize Storybook with modern React projects

```bash
npx storybook@latest init --type react-vite
```

### 2. **Component Auto-Documentation**  
Extract props automatically from TypeScript interfaces

```typescript
// Auto-generates controls based on component props
export const Default: Story = {
  args: {
    variant: 'primary',
    size: 'medium',
    disabled: false
  }
}
```

### 3. **Design Token Integration**
Connect design systems with Storybook themes

```typescript
// .storybook/preview.ts
export const parameters = {
  backgrounds: {
    values: [
      { name: 'Light', value: '#ffffff' },
      { name: 'Dark', value: '#10141a' }
    ]
  }
}
```

### 4. **TypeScript Story Templates**
Type-safe story creation patterns

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Example/Button',
  component: Button,
  parameters: {
    layout: 'centered'
  },
  tags: ['autodocs'],
  argTypes: {
    backgroundColor: { control: 'color' }
  }
}

export default meta
type Story = StoryObj<typeof meta>
```

### 5. **Accessibility Testing Integration**
A11y addon setup and testing patterns

```typescript
// .storybook/main.ts
addons: [
  '@storybook/addon-a11y',
  '@storybook/addon-docs'
]
```

### 6. **Visual Regression Testing**
Chromatic or Percy integration

```yaml
# .github/workflows/chromatic.yml
- name: Run Chromatic
  uses: chromaui/action@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
```

### 7. **Component Story Generation**
Automated story creation from component files

```typescript
// Auto-generate stories for common patterns
const createStory = (args: ComponentProps) => ({
  render: () => <Component {...args} />
})
```

### 8. **Addon Configuration**
Essential addons for modern development

```typescript
// .storybook/main.ts
addons: [
  '@storybook/addon-essentials',
  '@storybook/addon-interactions',
  '@storybook/addon-a11y',
  '@storybook/addon-design-tokens'
]
```

### 9. **Build Optimization**
Vite-specific optimizations for faster builds

```typescript
// .storybook/main.ts
viteFinal: (config) => {
  config.optimizeDeps = {
    include: ['react', 'react-dom']
  }
  return config
}
```

### 10. **Deployment Automation**
Build and deploy Storybook to static hosting

```bash
npm run build-storybook
# Deploy to Netlify, Vercel, or GitHub Pages
```

## Core Implementation Patterns

### Modern Storybook Setup (v7+)

```typescript
// .storybook/main.ts
import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx|mdx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y'
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {}
  },
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) => (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true)
    }
  }
}

export default config
```

### Component Story Template

```typescript
// Button.stories.ts
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'outline']
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg']
    }
  }
}

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Button'
  }
}

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Button'
  }
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-4">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
    </div>
  )
}
```

### Dark Theme Integration

```typescript
// .storybook/preview.ts
import type { Preview } from '@storybook/react'
import '../src/index.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#10141a' },
        { name: 'light', value: '#ffffff' }
      ]
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/
      }
    }
  }
}

export default preview
```

## Quick Setup Commands

### 1. Initialize Storybook
```bash
npx storybook@latest init
```

### 2. Install Additional Addons
```bash
npm install --save-dev @storybook/addon-a11y @storybook/addon-design-tokens
```

### 3. Generate Component Stories
```bash
npx storybook@latest add @storybook/addon-essentials
```

### 4. Build for Production
```bash
npm run build-storybook
```

## Integration Checklist

- [ ] Storybook 7+ with Vite integration
- [ ] TypeScript configuration with docgen
- [ ] Essential addons installed
- [ ] Component story templates created
- [ ] Dark/light theme support
- [ ] Accessibility testing enabled
- [ ] Auto-documentation configured
- [ ] Build pipeline setup
- [ ] Deployment target configured

## Troubleshooting Common Issues

### TypeScript Props Not Showing
```typescript
// Ensure proper docgen configuration
typescript: {
  reactDocgen: 'react-docgen-typescript',
  reactDocgenTypescriptOptions: {
    shouldExtractLiteralValuesFromEnum: true,
    compilerOptions: {
      allowSyntheticDefaultImports: false,
      esModuleInterop: false
    }
  }
}
```

### Vite Build Errors
```typescript
// Add Vite optimizations
viteFinal: (config) => {
  return {
    ...config,
    optimizeDeps: {
      ...config.optimizeDeps,
      include: [...(config.optimizeDeps?.include ?? []), 'react', 'react-dom']
    }
  }
}
```

This skill provides comprehensive Storybook setup and documentation automation for modern React+TypeScript projects, covering the most common use cases and integration patterns used in production environments.