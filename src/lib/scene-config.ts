import type { SceneConfig } from '@/types/pipeline';

const BASE_NEGATIVE =
  'completely closed eyes, eyes shut, jerky, sudden movement, blurry, low quality, deformed, distorted, artifacts, morphing, camera shake, camera movement, zoom, dolly, pan, tilt, tracking shot, walking, stepping, leg movement, running, jumping, foot movement, laughing, smiling';

export const ALL_SCENES: SceneConfig[] = [
  {
    index: 0,
    label: 'Chỉ nói, không đưa tay',
    prompt:
      'Person speaks naturally with normal head movement and body language. Hands completely still and resting at sides at all times. No hand gestures whatsoever. Natural facial expressions and eye blinking.',
    negativePrompt: `arms raising, arms reaching, hand gestures, waving, pointing, arm movement, gesticulating, ${BASE_NEGATIVE}`,
    duration: 4,
    seedOffset: 0,
    hasArm: false,
  },
  {
    index: 1,
    label: '1 tay',
    prompt:
      'Person speaks naturally with normal head and body movement. Gently raises right hand upward with a soft slow motion, one hand move expressively. Only one hand moves. Natural facial expressions and eye contact. Only one hand gesture.',
    negativePrompt: `both hands moving, two hands gesturing, ${BASE_NEGATIVE}`,
    duration: 4,
    seedOffset: 10,
    hasArm: true,
  },
  {
    index: 2,
    label: '2 tay',
    prompt:
      'The person speaks to the camera. Hands open, arms extending out to the sides, then returning to rest. One hand gesture only. Head nods once with the gesture for emphasis. Leans slightly forward with the gesture for emphasis, then settles back naturally. Smooth, expressive, and continuous movement throughout.',
    negativePrompt: `hands still, hands at rest, motionless arms, static pose, frozen hands, ${BASE_NEGATIVE}`,
    duration: 4,
    seedOffset: 20,
    hasArm: true,
  },
  {
    index: 3,
    label: 'Chỉ lên trời',
    prompt:
      'Person slowly raises right index finger and points upward. One hand only, holds the pointed finger up for the entire duration of the video. One hand only, index finger pointing straight up, arm stays raised and still. Natural facial expression.',
    negativePrompt: `both hands moving, two hands, left hand raising, other hand moving, ${BASE_NEGATIVE}`,
    duration: 4,
    seedOffset: 30,
    hasArm: true,
  },
];

export const QUICK_SCENE = ALL_SCENES[0];
