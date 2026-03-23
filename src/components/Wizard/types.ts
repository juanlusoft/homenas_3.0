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
  poolMode: 'single' | 'mirror' | 'stripe' | 'raidz';
  poolFs: 'ext4' | 'btrfs' | 'zfs';
  selectedDisks: string[];
}

export type StepProps = {
  data: SetupData;
  update: <K extends keyof SetupData>(key: K, value: SetupData[K]) => void;
};
