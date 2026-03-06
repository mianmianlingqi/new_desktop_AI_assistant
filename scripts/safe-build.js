const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const currentVersion = packageJson.version;
const distDir = path.join(projectRoot, 'dist');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toWindowsPathPattern(targetPath) {
  return targetPath.replace(/\\/g, '\\\\');
}

function stopProjectProcesses() {
  if (process.platform !== 'win32') {
    return;
  }

  const distPattern = toWindowsPathPattern(path.join(projectRoot, 'dist'));
  const electronPattern = toWindowsPathPattern(path.join(projectRoot, 'node_modules', 'electron', 'dist'));
  const tempPattern = toWindowsPathPattern(path.join(process.env.TEMP || process.env.TMP || '', 'desktop-ai-assistant'));
  const commands = [
    `Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'Desktop AI Assistant*' -or $_.ExecutablePath -like '${distPattern}*' -or $_.ExecutablePath -like '${electronPattern}*' -or $_.ExecutablePath -like '${tempPattern}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    `Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${electronPattern}*' } | Stop-Process -Force`
  ];

  for (const command of commands) {
    spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
      stdio: 'ignore'
    });
  }

  console.log('[safe-build] 已尝试关闭项目相关运行进程与残留包装进程');
}

async function removePathWithRetry(targetPath, maxRetries = 12, delayMs = 1500) {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      if (!fs.existsSync(targetPath)) {
        return;
      }

      const stat = fs.lstatSync(targetPath);
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.rmSync(targetPath, { force: true });
      }

      return;
    } catch (error) {
      if (attempt === maxRetries) {
        throw new Error(`无法清理 ${targetPath}: ${error.message}`);
      }

      console.log(`[safe-build] 等待释放文件锁: ${path.basename(targetPath)} (${attempt}/${maxRetries})`);
      await sleep(delayMs);
    }
  }
}

async function cleanupBuildArtifacts() {
  const targets = [
    { path: path.join(distDir, 'win-unpacked'), strict: true },
    { path: path.join(distDir, `Desktop AI Assistant Setup ${currentVersion}.exe`), strict: false },
    { path: path.join(distDir, `Desktop AI Assistant Setup ${currentVersion}.exe.blockmap`), strict: false },
    { path: path.join(distDir, `Desktop AI Assistant-${currentVersion}-portable.exe`), strict: false },
    { path: path.join(distDir, 'builder-debug.yml'), strict: false },
    { path: path.join(distDir, 'builder-effective-config.yaml'), strict: false },
    { path: path.join(distDir, 'latest.yml'), strict: false }
  ];

  for (const target of targets) {
    try {
      await removePathWithRetry(target.path, target.strict ? 12 : 24, target.strict ? 1500 : 2500);
    } catch (error) {
      if (target.strict) {
        throw error;
      }

      console.warn(`[safe-build] 跳过预清理，交由 electron-builder 处理文件锁: ${target.path}`);
    }
  }

  console.log('[safe-build] 已清理当前版本构建产物');
}

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
    stopProjectProcesses();
    await cleanupBuildArtifacts();

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