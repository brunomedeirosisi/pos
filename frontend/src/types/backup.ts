export type BackupRecord = {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  checksum: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy: {
    id: string;
    fullName: string;
  } | null;
};

export type RestoreRequest = {
  file: string;
  password: string;
  confirm: true;
};
