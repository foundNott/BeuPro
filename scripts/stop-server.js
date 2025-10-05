// Stop the server started by scripts/server.js by reading .server.pid and killing the process
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const pidFile = path.join(root, '.server.pid');
try{
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  if (!isNaN(pid) && pid > 0){
    try{ process.kill(pid, 'SIGTERM'); console.log(`Sent SIGTERM to pid ${pid}`); }catch(e){ console.error('Failed to kill process', e.message); }
  } else console.error('No valid pid found in', pidFile);
  try{ fs.unlinkSync(pidFile); }catch(e){}
}catch(e){ console.error('Could not read pid file:', e.message); process.exitCode = 1; }
