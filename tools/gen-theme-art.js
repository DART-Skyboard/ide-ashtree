// Regenerates phone/assets/themes/*.svg (+ accent emblems) from js/phone/theme-art.js.   node tools/gen-theme-art.js
'use strict';
var fs = require('fs'), path = require('path'), A = require('../js/phone/theme-art.js');
var out = path.join(__dirname, '..', 'phone', 'assets', 'themes');
fs.mkdirSync(out, { recursive: true });
A.themes.forEach(function (t) {
  var id = t.toLowerCase().replace(/\s+/g, '-');
  fs.writeFileSync(path.join(out, id + '.svg'), A.svg(t));
  fs.writeFileSync(path.join(out, id + '-landscape.svg'), A.svg(t, { w: 1560, h: 720 }));
  fs.writeFileSync(path.join(out, id + '-accent.svg'), A.accent(t, 256));
});
console.log('wrote', A.themes.length * 3, 'svg files to', out);
