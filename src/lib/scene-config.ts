import type { SceneConfig } from '@/types/pipeline';

const BASE_NEGATIVE =
  'completely closed eyes, eyes shut, jerky, sudden movement, blurry, low quality, deformed, distorted, artifacts, morphing, camera shake, camera movement, zoom, dolly, pan, tilt, tracking shot, walking, stepping, leg movement, running, jumping, foot movement, laughing, smiling';

export const ALL_SCENES: SceneConfig[] = [
  {
    index: 0,
    label: 'Chỉ nói, không đưa tay',
    prompt:
      'Person speaks naturally to the camera. Eyes blink regularly and naturally throughout the entire video. Hands completely still and resting at all times. Subtle natural head movement. Natural facial expressions with frequent eye blinking.',
    negativePrompt: `arms raising, arms reaching, hand gestures, waving, pointing, arm movement, gesticulating, eyes wide open without blinking, ${BASE_NEGATIVE}`,
    duration: 2.5,
    seedOffset: 0,
    hasArm: false,
    useEndImage: true,
  },
  {
    index: 1,
    label: '1 tay',
    prompt:
      'A person is speaking to the camera. Their right hand rises and makes a single expressive gesture at chest level. Their left hand stays completely still at rest the entire time. Right arm moves, left arm does not move.',
    negativePrompt: `both hands moving, two hands gesturing, left hand gesture, left arm moving, symmetric gesture, ${BASE_NEGATIVE}`,
    duration: 4,
    seedOffset: 10,
    hasArm: true,
    useEndImage: true,
  },
  {
    index: 2,
    label: '2 tay',
    prompt:
      'A person talking to camera. Naturally speaking, both hands move expressively, two arms spread expressively to the sides. Hands sweep out then come back in.',
    negativePrompt: `hands frozen, no movement, hands stay open, arms stay extended, static pose, ${BASE_NEGATIVE}`,
    duration: 2.5,
    seedOffset: 20,
    hasArm: true,
    useEndImage: true,
  },
  {
    index: 3,
    label: 'Chỉ lên trời',
    prompt:
      'Person slowly raises right index finger and points upward. One hand only, holds the pointed finger up for the entire duration of the video. One hand only, index finger pointing straight up, arm stays raised and still. Natural facial expression.',
    negativePrompt: `${BASE_NEGATIVE}`,
    duration: 2,
    seedOffset: 30,
    hasArm: true,
    useEndImage: false,
  },
];

export const QUICK_SCENE = ALL_SCENES[1]; // 1 tay
