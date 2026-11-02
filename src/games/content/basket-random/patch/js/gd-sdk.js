// Local stand-in for the GameDistribution host SDK.
//
// This Construct 3 export still carries the GameDistribution plugin, and when
// the runtime starts it injects patch/js/gd-sdk.js from its old host. That file
// was never vendored, and the plugin's missing-SDK guard compares against the
// string "undefined" instead of the value, so pressing PLAY threw
// "Cannot read properties of undefined (reading 'showAd')" and the match never
// started. Bored shows no ads, so this stub acknowledges each ad request and
// hands control straight back to the game.
(function () {
  const notify = name => {
    try {
      const options = window.GD_OPTIONS;
      if (options && typeof options.onEvent === 'function') options.onEvent({ name });
    } catch (error) {
      /* the frame may already be gone */
    }
  };
  window.gdsdk = {
    showAd(type) {
      notify('SDK_GAME_PAUSE');
      setTimeout(() => {
        if (type === 'rewarded') notify('COMPLETE');
        notify('SDK_GAME_START');
      }, 0);
    },
    preloadAd() {
      return Promise.resolve();
    }
  };
  // The plugin marks itself ready on this event, so defer until its handler is wired.
  setTimeout(() => notify('SDK_READY'), 0);
})();
