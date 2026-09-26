// Runs before first paint: pick the language (?lang=de|en, else saved choice, else browser language).
(function () {
  var lang = 'en';
  var param = /[?&]lang=(de|en)\b/.exec(location.search);
  try {
    var saved = localStorage.getItem('lang');
    if (param) lang = param[1];
    else if (saved === 'de' || saved === 'en') lang = saved;
    else if (/^de\b/i.test((navigator.languages && navigator.languages[0]) || navigator.language || '')) lang = 'de';
  } catch (e) {
    if (param) lang = param[1];
    else if (/^de\b/i.test(navigator.language || '')) lang = 'de';
  }
  var root = document.documentElement;
  root.setAttribute('data-lang', lang);
  root.setAttribute('lang', lang);
})();
