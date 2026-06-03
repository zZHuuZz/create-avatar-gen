import type { SceneConfig } from '@/types/pipeline';

const BASE_NEGATIVE =
  'completely closed eyes, eyes shut, jerky, sudden movement, blurry, low quality, deformed, distorted, artifacts, morphing, camera shake, camera movement, zoom, dolly, pan, tilt, tracking shot, walking, stepping, leg movement, running, jumping, foot movement, laughing, smiling';

const HAND_NEGATIVE = `deformed hands, extra fingers, missing fingers, malformed hands, ${BASE_NEGATIVE}`;

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
      'A person is speaking to the camera. Primary motion: right hand rises to chest level making a single gentle gesture. Slow and controlled hand movement. Natural facial expressions with frequent eye blinking.',
    negativePrompt: `left arm moving, both hands moving, two hands gesturing, symmetric gesture, rapid movement, ${BASE_NEGATIVE}`,
    duration: 5,
    seedOffset: 10,
    hasArm: true,
    useEndImage: true,
    poseConfig: {
      referenceImageFile: 'reference-onehand.jpg',
      posePrompt:
        'Right hand raised to chest height, open palm facing slightly forward. Left hand and left forearm stay at waist level, fully visible. Both forearms visible from elbow to wrist. Output framed waist-up so no hand or forearm is cropped.',
      stageInto: {
        prompt:
          'Person smoothly raises right hand from resting position up to chest level, making a gentle open-palm gesture. Slow, gradual, natural arm movement. Left arm stays completely still.',
        negativePrompt: `sudden movement, left arm moving, both hands moving, ${HAND_NEGATIVE}`,
        duration: 2,
      },
      stageHold: {
        prompt:
          'Person speaking naturally to camera. Right hand held at chest level with open palm. Subtle head movement and natural blinking. Body and arms stay still.',
        negativePrompt: `arms dropping, hands lowering, arm movement, ${HAND_NEGATIVE}`,
        duration: 3,
      },
      stageOut: {
        prompt:
          'Person smoothly lowers right hand from chest level back down to rest at their side. Slow, gradual, natural arm movement.',
        negativePrompt: `sudden movement, left arm moving, both hands moving, ${HAND_NEGATIVE}`,
        duration: 2,
      },
    },
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
      'A person speaking naturally. Primary motion: right hand gently pointing the index finger straight upward to the sky. Slow, steady, and deliberate pointing gesture. High quality hand anatomy.',
    negativePrompt: `left arm raising, left arm moving, both arms raised, two arms up, multiple fingers pointing, waving, deformed hands, extra fingers, fast movement, ${BASE_NEGATIVE}`,
    duration: 5,
    seedOffset: 30,
    hasArm: true,
    useEndImage: true,
    poseConfig: {
      referenceImageFile: 'reference-pointup.jpg',
      posePrompt:
        'Right arm raised, right index finger pointing straight up, all other fingers naturally curled. Left arm bent at elbow, left forearm angled slightly forward, left hand visible at lower-abdomen/waist level in front of the body — relaxed, NOT touching the chest, NOT pressed against the side. BOTH arms and BOTH hands must be visible in the output. Frame waist-up; keep the same head size as the original portrait; do NOT zoom out to full body.',
      stageInto: {
        prompt:
          'Person smoothly raises right arm upward, extending index finger to point straight up at the sky. Slow, deliberate pointing motion. Left arm stays still at rest.',
        negativePrompt: `sudden movement, multiple fingers pointing, left arm moving, both hands moving, ${HAND_NEGATIVE}`,
        duration: 2,
      },
      stageHold: {
        prompt:
          'Person speaking naturally to camera. Right arm raised high with index finger pointing straight up. Subtle head movement and natural blinking. Arm stays raised and completely still.',
        negativePrompt: `arm dropping, hand lowering, arm movement, finger curling, ${HAND_NEGATIVE}`,
        duration: 3,
      },
      stageOut: {
        prompt:
          'Person smoothly lowers right arm from pointing-up position back down to rest at their side. Slow, gradual, natural arm movement.',
        negativePrompt: `sudden movement, left arm moving, both hands moving, ${HAND_NEGATIVE}`,
        duration: 2,
      },
    },
  },
];

export const QUICK_SCENE = ALL_SCENES[0];
export const POSED_SCENE_INDICES = new Set([1, 3]);
