// Applied only to the iOS score reader's main frame, before the remote player
// loads. This chooses the audio category; it does not start or activate audio.
export const IOS_PLAYER_AUDIO_SESSION_SCRIPT = `
  (function () {
    try {
      if (navigator.audioSession && 'type' in navigator.audioSession) {
        navigator.audioSession.type = 'playback';
      }
    } catch (_) {
      // Older WebKit versions can continue with their default audio behavior.
    }
  })();
  true;
`;
