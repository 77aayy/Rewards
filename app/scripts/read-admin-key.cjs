const fs = require('fs');
const path = require('path');
try {
  const c = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  const m = c.match(/VITE_ADMIN_SECRET_KEY\s*=\s*(.+)/);
  process.stdout.write(m ? m[1].replace(/^["']|["']$/g, '').trim() : '');
} catch (e) {}
