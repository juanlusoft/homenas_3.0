import type { ComponentType } from 'react';

export type ModuleId =
  | 'dashboard'
  | 'files'
  | 'shares'
  | 'storage'
  | 'backup'
  | 'active-backup'
  | 'services'
  | 'stacks'
  | 'homestore'
  | 'network'
  | 'logs'
  | 'terminal'
  | 'vpn'
  | 'scheduler'
  | 'system'
  | 'settings'
  | 'users';

export type ModuleGroup = 'core' | 'operations' | 'admin';

export interface DashboardModule {
  id: ModuleId;
  title: string;
  subtitle: string;
  icon: string;
  group: ModuleGroup;
  adminOnly?: boolean;
  Component: ComponentType;
}
