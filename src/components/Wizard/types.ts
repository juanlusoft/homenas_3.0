export interface SetupData {
  language: string;
  hostname: string;
  username: string;
  password: string;
  passwordConfirm: string;
  networkMode: 'dhcp' | 'static';
  staticIp: string;
  gateway: string;
  dns: string;
  poolMode: 'snapraid' | 'mirror' | 'basic';
  poolFs: 'ext4' | 'btrfs' | 'xfs';
  selectedDisks: string[];
  parityDisks: string[];
  dataDisks: string[];
  cacheDisks: string[];
}

export type StepProps = {
  data: SetupData;
  update: <K extends keyof SetupData>(key: K, value: SetupData[K]) => void;
};
