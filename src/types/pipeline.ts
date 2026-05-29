export type SceneStatus = 'pending' | 'submitting' | 'generating' | 'done' | 'error';

export interface SceneResult {
  index: number;
  label: string;
  status: SceneStatus;
  progress: number;
  jobId?: string;
  frampackUrl?: string;
  error?: string;
}

export interface SceneConfig {
  index: number;
  label: string;
  prompt: string;
  negativePrompt: string;
  duration: number;
  seedOffset: number;
  hasArm: boolean;
  useEndImage: boolean;
}

export type AppStep = 1 | 2 | 3;

export interface GenerateVideoRequest {
  imageBase64: string;
  frampackUrl: string;
  scenes: 'quick' | 'all';
  baseSeed: number;
  sceneIndex?: number;
}

export type SSEEvent =
  | { type: 'scene-start'; sceneIndex: number; label: string }
  | { type: 'scene-progress'; sceneIndex: number; pct: number }
  | { type: 'scene-done'; sceneIndex: number; jobId: string; frampackUrl: string }
  | { type: 'scene-error'; sceneIndex: number; error: string }
  | { type: 'all-done' }
  | { type: 'error'; message: string };
