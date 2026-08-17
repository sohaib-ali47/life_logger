/* Icons — inline SVG, 24px grid, 1.5px stroke, no dependency.
   Usage: Icons.svg('moon', 18)  ->  SVGElement                      */
(function (global) {
  'use strict';

  const P = {
    /* categories */
    moon:       'M12 3a6.4 6.4 0 0 0 9 9 9 9 0 1 1-9-9Z',
    activity:   'M22 12h-3.6l-2.7 7.5L9.3 4.5 6.6 12H2',
    book:       'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z',
    layers:     'm12 2.5 9 4.7-9 4.7-9-4.7 9-4.7ZM3 12.2l9 4.7 9-4.7M3 16.9l9 4.7 9-4.7',
    briefcase:  'M8 21V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v16M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
    coffee:     'M17 8h1.5a3.5 3.5 0 0 1 0 7H17M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8ZM7 2v2.5M11 2v2.5M15 2v2.5',
    phone:      'M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM12 18.2h.01',
    droplet:    'M12 2.7 6.5 8.5a7.8 7.8 0 1 0 11 0L12 2.7Z',
    utensils:   'M4 2v6.5a2 2 0 0 0 2 2h.5a2 2 0 0 0 2-2V2M6.2 10.5V22M18.5 2c-1.7 0-3 2.2-3 5.5s1.3 5 3 5V22',
    smile:      'M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19ZM8.2 13.8s1.4 2 3.8 2 3.8-2 3.8-2M9.2 9.3h.01M14.8 9.3h.01',
    zap:        'M13 2.5 4 14h7l-1 7.5L20 10h-7l1-7.5Z',

    /* nav + ui */
    calendar:   'M8 2.5v3.5M16 2.5v3.5M3.5 10h17M5.5 4.5h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z',
    barchart:   'M3.5 3v18h17M8 17v-5.5M13 17V7.5M18 17v-3',
    check:      'm9 12.4 2.6 2.6L21 5.6M20.5 12v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2H16',
    database:   'M12 8.2c4.4 0 8-1.4 8-3.1S16.4 2 12 2 4 3.4 4 5.1s3.6 3.1 8 3.1ZM4 5.1v13.8C4 20.6 7.6 22 12 22s8-1.4 8-3.1V5.1M4 12c0 1.7 3.6 3.1 8 3.1s8-1.4 8-3.1',
    plus:       'M12 5v14M5 12h14',
    minus:      'M5 12h14',
    x:          'M18 6 6 18M6 6l12 12',
    play:       'M7 4.5v15l13-7.5-13-7.5Z',
    stop:       'M6.5 6.5h11v11h-11z',
    trash:      'M3.5 6h17M8.5 6V4.2a1.7 1.7 0 0 1 1.7-1.7h3.6a1.7 1.7 0 0 1 1.7 1.7V6M18.5 6v14a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V6',
    left:       'm14.5 5-7 7 7 7',
    right:      'm9.5 5 7 7-7 7',
    up:         'm5.5 14 6.5-6.5 6.5 6.5',
    down:       'm5.5 10 6.5 6.5 6.5-6.5',
    arrowup:    'M12 19V5M6 11l6-6 6 6',
    arrowdown:  'M12 5v14M6 13l6 6 6-6',
    dash:       'M6 12h12',
    sun:        'M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM12 1.8v2M12 20.2v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M1.8 12h2M20.2 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
    download:   'M12 3v12M7 10.5l5 5 5-5M4 20h16',
    upload:     'M12 15.5V3.5M7 8.5l5-5 5 5M4 20h16',
    edit:       'M17 3.5a2.1 2.1 0 0 1 3 3L7.5 19 3 20.5 4.5 16 17 3.5Z',
    external:   'M9 5H5.5a2 2 0 0 0-2 2v11.5a2 2 0 0 0 2 2H17a2 2 0 0 0 2-2V15M14 3.5h6.5V10M20.5 3.5 11 13',
    clock:      'M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19ZM12 6.8V12l3.4 2',
    flame:      'M12 22c3.9 0 7-3 7-6.8 0-4.6-4-6.3-4.6-10.7-2 1.4-3.1 3.2-3.1 5.2 0 1.4-1 2-1.7 1.3-.6-.6-.9-1.5-.9-2.3C7 10.2 5 12 5 15.2 5 19 8.1 22 12 22Z',
    inbox:      'M20.5 12.5h-5l-1.5 3h-4l-1.5-3h-5M6.2 4.5h11.6a2 2 0 0 1 1.8 1.2l2.4 5.6v6.2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6.2l2.4-5.6a2 2 0 0 1 1.8-1.2Z',
    grid:       'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    settings:   'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.5 1.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z',
    target:     'M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    sparkle:    'm12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z',
    table:      'M3.5 9.5h17M3.5 15h17M9.5 4v16M5.5 4h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
    lock:       'M7 10.5V7.5a5 5 0 0 1 10 0v3M5.5 10.5h13a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20v-8a1.5 1.5 0 0 1 1.5-1.5Z',
    refresh:    'M20.5 11a8.5 8.5 0 1 0-.6 4M20.5 4.5V11h-6.5'
  };

  function svg(name, size) {
    const s = size || 18;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('width', s);
    el.setAttribute('height', s);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '1.6');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('aria-hidden', 'true');
    el.classList.add('ico');
    const d = P[name] || P.grid;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    el.appendChild(path);
    return el;
  }

  global.Icons = { svg, paths: P };
})(window);
