import { spawn } from 'node:child_process';

const children = [
  spawn('npm', ['run', 'dev:server'], { stdio: 'inherit', env: process.env }),
  spawn('npm', ['run', 'dev:client'], { stdio: 'inherit', env: process.env }),
];
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
process.on('SIGINT', () => close());
process.on('SIGTERM', () => close());
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    close(1);
  });
  child.on('exit', (code) => {
    if (!closing) close(code ?? 1);
  });
}
