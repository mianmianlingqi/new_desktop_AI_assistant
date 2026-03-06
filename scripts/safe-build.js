const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function getConfigCandidates() {
  const appData = process.env.APPDATA || '';
  const home = process.env.USERPROFILE || process.env.HOME || '';

  return [
    path.join(appData, 'desktop-ai-assistant', 'config.json'),
    path.join(appData, 'Desktop AI Assistant', 'config.json'),
    path.join(home, 'AppData', 'Roaming', 'desktop-ai-assistant', 'config.json'),
    path.join(home, 'AppData', 'Roaming', 'Desktop AI Assistant', 'config.json')
  ];
}

function backupConfigs(paths) {
  const backups = [];

  for (const filePath of paths) {
    if (!filePath || !fs.existsSync(filePath)) {
      continue;
    }

    const backupPath = `${filePath}.build-backup`;
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(filePath, backupPath);
    fs.rmSync(filePath, { force: true });
    backups.push({ filePath, backupPath });
    console.log(`[safe-build] 已暂存本机配置: ${filePath}`);
  }

  return backups;
}

function restoreConfigs(backups) {
  for (const { filePath, backupPath } of backups) {
    if (!fs.existsSync(backupPath)) {
      continue;
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.copyFileSync(backupPath, filePath);
    fs.rmSync(backupPath, { force: true });
    console.log(`[safe-build] 已恢复本机配置: ${filePath}`);
  }
}

async function run() {
  const buildArgs = process.argv.slice(2);
  const backups = backupConfigs(getConfigCandidates());

  try {
    const builderExecutable = path.join(
      __dirname,
      '..',
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
    );
    const child = process.platform === 'win32'
      ? spawn(builderExecutable, buildArgs, {
          stdio: 'inherit',
          shell: true,
          env: {
            ...process.env,
            DESKTOP_AI_ASSISTANT_SAFE_BUILD: '1'
          }
        })
      : spawn(builderExecutable, buildArgs, {
          stdio: 'inherit',
          shell: false,
          env: {
            ...process.env,
            DESKTOP_AI_ASSISTANT_SAFE_BUILD: '1'
          }
        });

    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });

    restoreConfigs(backups);
    process.exit(exitCode || 0);
  } catch (error) {
    restoreConfigs(backups);
    console.error(`[safe-build] 打包失败: ${error.message}`);
    process.exit(1);
  }
}

run();