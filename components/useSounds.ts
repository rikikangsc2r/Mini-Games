import { useCallback } from 'react';

// Define the types of sounds the application can play.
export type SoundName = 'place' | 'win' | 'draw' | 'select' | 'back' | 'notify' | 'check' | 'capture';

// A single AudioContext is created and reused. It's initialized lazily on the first sound playback.
let audioContext: AudioContext | null = null;

// Helper to ensure the AudioContext is running. Browsers often require a user interaction to start it.
const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    // Standard AudioContext or fallback for older Safari versions.
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
};

// Main function to play a sound. It creates oscillators and gain nodes to generate audio programmatically.
const playSoundEffect = (soundName: SoundName) => {
  const ctx = getAudioContext();

  // Resume the context if it's suspended (e.g., due to browser autoplay policies).
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  // A helper to create a single tone with a volume envelope.
  const playTone = (
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume: number = 0.5
  ) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, startTime);

    // Create a simple attack-decay envelope to avoid harsh clicks.
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01); // Quick attack
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration); // Linear decay

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  };

  const now = ctx.currentTime;

  switch (soundName) {
    case 'place':
      playTone(350, now, 0.1, 'triangle', 0.4);
      break;
    case 'capture':
      playTone(200, now, 0.15, 'square', 0.5);
      break;
    case 'select':
      playTone(550, now, 0.1, 'sine', 0.3);
      break;
    case 'notify':
      playTone(880, now, 0.3, 'sine', 0.5);
      break;
    case 'check':
      playTone(987.77, now, 0.15, 'square', 0.3); // B5 note for urgency
      break;
    case 'win':
      // Ascending arpeggio for a win
      playTone(523.25, now, 0.15, 'sine', 0.4); // C5
      playTone(659.25, now + 0.1, 0.15, 'sine', 0.4); // E5
      playTone(783.99, now + 0.2, 0.2, 'sine', 0.4); // G5
      break;
    case 'draw':
      // A neutral, two-tone sound for a draw or loss
      playTone(440, now, 0.15, 'sine', 0.4); // A4
      playTone(349.23, now + 0.15, 0.2, 'sine', 0.4); // F4
      break;
    case 'back':
      // A downward frequency sweep for 'back' action
      {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
        
        oscillator.frequency.setValueAtTime(600, now);
        oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.2);
        
        oscillator.start(now);
        oscillator.stop(now + 0.2);
      }
      break;
    default:
      // In case an unknown sound name is passed, do nothing.
      break;
  }
};

const useSounds = () => {
  // The hook returns a memoized function to play sounds.
  // The actual sound generation logic is outside the component lifecycle.
  const playSound = useCallback((soundName: SoundName) => {
    try {
      playSoundEffect(soundName);
    } catch (error) {
      // Log a warning if the Web Audio API fails for any reason.
      console.warn(`Could not play sound "${soundName}":`, error);
    }
  }, []);

  return playSound;
};

export default useSounds;