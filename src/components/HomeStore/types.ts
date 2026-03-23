export interface StoreApp {
  id: string;
  name: string;
  icon: string;
  author: string;
  description: string;
  version: string;
  category: AppCategory;
  port?: number;
  official: boolean;
  installed: boolean;
  running: boolean;
  image: string; // Docker image
  size: string;
}

export type AppCategory = 'media' | 'productivity' | 'security' | 'development' | 'network' | 'backup' | 'monitoring';
