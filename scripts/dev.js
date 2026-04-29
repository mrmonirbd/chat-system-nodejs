const { spawn } = require('child_process');

const commands = [
  {
    name: 'backend',
    command: 'npm',
    args: ['run', 'dev', '--workspace', 'backend']
  },
  {
    name: 'frontend',
    command: 'npm',
    args: ['run', 'dev', '--workspace', 'frontend']
  }
];

const processes = commands.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe']
  });

  child.stdout.on('data', (data) => {
    process.stdout.write(`[${name}] ${data}`);
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(`[${name}] ${data}`);
  });

  child.on('exit', (code) => {
    if (code === 0) return;
    console.error(`[${name}] exited with code ${code}`);
    shutdown();
  });

  return child;
});

function shutdown() {
  for (const child of processes) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
