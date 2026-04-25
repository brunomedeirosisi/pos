import { z } from 'zod';

export const restoreSchema = z.object({
  file: z.string().min(1),
  confirm: z.boolean().refine((value) => value === true, 'Confirmation required'),
  password: z.string().min(1),
});

export type RestoreBackupInputDto = z.infer<typeof restoreSchema>;

export type BackupDto = {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  checksum: string | null;
  metadata: unknown;
  createdBy: {
    id: string;
    fullName: string;
  } | null;
};