const fs = require('fs');
['merge-err.txt', 'merge-result.txt'].forEach(f => {
  try {
    const b = fs.readFileSync(f);
    if (b.length) { console.log('=== ' + f + ' (utf8) ==='); console.log(b.toString('utf8').replace(/\x00/g, '')); }
  } catch (e) { console.log('no ' + f); }
});
