// Gym PIN lock screen — shared across all pages
// Checks localStorage for a valid PIN, shows overlay if missing
(function() {
  var PIN_KEY = 'wodboard-gym-pin';
  var storedPin = localStorage.getItem(PIN_KEY);

  // Get API URL from localStorage
  function getApiUrl() {
    try {
      var s = JSON.parse(localStorage.getItem('wodboard') || '{}');
      if (s.appsScriptUrl) return s.appsScriptUrl;
    } catch(e) {}
    return localStorage.getItem('wodboard-api') || '';
  }

  // result: 'valid', 'invalid', or 'error' (timeout/network)
  function verifyPin(pin, cb) {
    var api = getApiUrl();
    if (!api) { cb('error'); return; }
    var cbName = '_pinCb_' + Date.now();
    var script = document.createElement('script');
    var done = false;
    function finish(result) {
      if (done) return;
      done = true;
      delete window[cbName];
      if (script.parentNode) script.remove();
      cb(result);
    }
    window[cbName] = function(res) {
      finish(res && res.valid === true ? 'valid' : 'invalid');
    };
    script.onerror = function() { finish('error'); };
    setTimeout(function() { finish('error'); }, 15000);
    script.src = api + '?action=verifyPin&pin=' + encodeURIComponent(pin) + '&callback=' + cbName;
    document.body.appendChild(script);
  }

  function showLockScreen() {
    // Hide page content
    document.body.style.overflow = 'hidden';
    var overlay = document.createElement('div');
    overlay.id = 'gymPinOverlay';
    overlay.innerHTML =
      '<div style="position:fixed;inset:0;z-index:99999;background:#0a0a0a;display:flex;align-items:center;justify-content:center;font-family:Heebo,sans-serif;">' +
        '<div style="text-align:center;padding:2rem;">' +
          '<div style="font-size:3rem;margin-bottom:1rem;">🔒</div>' +
          '<h2 style="color:#f0f0f0;margin-bottom:0.5rem;font-size:1.3rem;">CrossFit Gush Etzion</h2>' +
          '<p style="color:#888;margin-bottom:1.5rem;font-size:0.9rem;">הזן קוד גישה למועדון</p>' +
          '<input id="gymPinInput" type="password" inputmode="numeric" maxlength="8" placeholder="קוד גישה" ' +
            'style="width:180px;padding:0.8rem 1rem;font-size:1.2rem;text-align:center;border-radius:12px;border:2px solid #333;background:#1a1a1a;color:#f0f0f0;outline:none;letter-spacing:0.3em;" />' +
          '<br/>' +
          '<button id="gymPinBtn" style="margin-top:1rem;padding:0.7rem 2.5rem;font-size:1rem;font-weight:700;border:none;border-radius:12px;background:#ef4444;color:white;cursor:pointer;">כניסה</button>' +
          '<p id="gymPinError" style="color:#ef4444;margin-top:0.8rem;font-size:0.85rem;min-height:1.2em;"></p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var input = document.getElementById('gymPinInput');
    var btn = document.getElementById('gymPinBtn');
    var err = document.getElementById('gymPinError');

    function submit() {
      var pin = input.value.trim();
      if (!pin) { err.textContent = 'הזן קוד'; return; }
      btn.disabled = true;
      btn.textContent = '...';
      verifyPin(pin, function(result) {
        if (result === 'valid') {
          localStorage.setItem(PIN_KEY, pin);
          overlay.remove();
          document.body.style.overflow = '';
          // Dispatch event so pages can init
          window.dispatchEvent(new Event('gym-pin-verified'));
        } else if (result === 'invalid') {
          err.textContent = 'קוד שגוי';
          btn.disabled = false;
          btn.textContent = 'כניסה';
          input.value = '';
          input.focus();
        } else {
          // API error — let user retry
          err.textContent = 'שגיאת תקשורת, נסה שוב';
          btn.disabled = false;
          btn.textContent = 'כניסה';
        }
      });
    }

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') submit(); });
    setTimeout(function() { input.focus(); }, 100);
  }

  // On load: verify stored PIN or show lock screen
  if (storedPin) {
    verifyPin(storedPin, function(result) {
      if (result === 'invalid') {
        // API explicitly said PIN is wrong — remove it
        localStorage.removeItem(PIN_KEY);
        showLockScreen();
      }
      // If 'valid' — page is already visible, do nothing
      // If 'error' (timeout/network) — keep stored PIN, allow access
      // The PIN was valid before; don't punish for a slow API
    });
  } else {
    // Check if PIN is even required (API might not have a PIN set)
    var api = getApiUrl();
    if (api) {
      verifyPin('', function(result) {
        if (result !== 'valid') {
          showLockScreen();
        }
      });
    }
    // If no API URL, allow access (first-time setup)
  }
})();
