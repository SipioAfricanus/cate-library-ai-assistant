// Website panel entry point.
//
// This is the ONLY file that touches the page's DOM. The core (../index.js) never calls
// getElementById -- that was the specific flaw in the old static/ram.js, which resolved
// '#ram-stage' and '#ram-canvas' at module scope and was therefore welded to one page and
// impossible to reuse for the desktop pet.
//
// It deliberately reproduces the OLD ram.js public API exactly:
//     window.ramMascot = { setTalking, celebrate, sad, reactToAnswer }
// so templates/chat.html keeps working unchanged. Those calls are spread across the send,
// stream, and human-input paths; changing the shape here would mean touching all of them and
// risking the chat flow to swap a mascot.
import { createMascot } from '../index.js';
import { createBleater } from '../audio/bleat.js';
import { detectOutcome } from '../behavior/react.js';

const stage = document.getElementById('ram-stage');
const canvas = document.getElementById('ram-canvas');
const soundBtn = document.getElementById('sound-toggle');

if (stage && canvas) {
  const mascot = createMascot({
    canvas,
    container: stage,
    // The panel is a normal browser tab, so document.hidden is the correct throttle signal.
    visibilityPolicy: 'document',
    maxFps: 60,
  });

  const bleater = createBleater();

  function paintSoundButton() {
    if (soundBtn) soundBtn.textContent = bleater.isEnabled() ? '🔊' : '🔇';
  }
  paintSoundButton();

  soundBtn?.addEventListener('click', () => {
    bleater.toggle();
    paintSoundButton();
  });

  // Click the ram for a wave. Cheap personality, and it makes the panel feel responsive
  // rather than decorative.
  canvas.style.cursor = 'pointer';
  canvas.addEventListener('click', () => mascot.celebrate());

  window.ramMascot = {
    setTalking(on) {
      mascot.setTalking(on);
      // Audio follows the talking state but only actually sounds if the user opted in --
      // setLooping is a no-op while disabled.
      bleater.setLooping(!!on);
    },
    celebrate: () => mascot.celebrate(),
    sad: () => mascot.sad(),
    reactToAnswer(text) {
      const outcome = detectOutcome(text);
      if (outcome === 'found') mascot.celebrate();
      else if (outcome === 'not_found') mascot.sad();
    },
    // Exposed for debugging from the console; not used by the page.
    _mascot: mascot,
  };
}
