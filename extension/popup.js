const $ = (id) => document.getElementById(id);

function fmtDate(iso) {
  if (!iso) return 'onbekend';
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function renderStatus(patchStatus, config) {
  $('branch-pill').textContent = `branch: ${config.branch}`;
  if (!patchStatus) return;

  $('patch-val').textContent = patchStatus.repoPatch || '?';
  if (patchStatus.patchAvailable) {
    $('patch-sub').textContent = `Live: ${patchStatus.livePatch} (nieuw!)`;
    $('patch-alert').textContent = `Nieuwe DBD patch ${patchStatus.livePatch} is live op de wiki (site staat op ${patchStatus.repoPatch}). Klik hieronder om bij te werken.`;
    $('patch-alert').classList.remove('hidden');
  } else {
    $('patch-sub').textContent = patchStatus.livePatch ? `Wiki: ${patchStatus.livePatch} ✓` : 'Wiki niet gecheckt';
    $('patch-alert').classList.add('hidden');
  }

  $('nl-val').textContent = patchStatus.nlCollectedAt ? fmtDate(patchStatus.nlCollectedAt) : 'geen data';
  $('nl-sub').textContent = patchStatus.nlGames
    ? `${patchStatus.nlGames.toLocaleString('nl-NL')} games${patchStatus.nlAgeDays != null ? ` · ${patchStatus.nlAgeDays}d oud` : ''}`
    : '';
}

function renderRunState(runState) {
  const running = Boolean(runState?.running);
  $('btn-update-all').disabled = running;
  $('btn-quick').disabled = running;
  $('btn-update-all').textContent = running ? '⏳ Update loopt op achtergrond…' : '🔄 Update alle data (Wiki + NightLight)';

  if (running) {
    $('progress-box').classList.remove('hidden');
    $('btn-cancel').classList.remove('hidden');
    $('progress-fill').style.width = `${Math.max(4, runState.percent || 0)}%`;
    $('progress-msg').textContent = runState.message || 'Bezig…';
    $('result-box').classList.add('hidden');
  } else {
    $('progress-box').classList.add('hidden');
    $('btn-cancel').classList.add('hidden');
    if (runState?.error) {
      $('result-box').className = 'result-box err';
      $('result-box').textContent = runState.error;
    } else if (runState?.lastSuccessAt) {
      $('result-box').className = 'result-box';
      $('result-box').innerHTML = `✓ Bijgewerkt (${fmtDate(runState.lastSuccessAt)}): ${runState.lastSummary || ''}<br><a href="${runState.lastCommitUrl}" target="_blank" rel="noreferrer">Bekijk commit op GitHub →</a>`;
    } else {
      $('result-box').classList.add('hidden');
    }
  }
}

async function init() {
  const { config: saved, patchStatus, runState } = await chrome.storage.local.get(['config', 'patchStatus', 'runState']);
  const config = { repo: 'ARBSOLUTIONS/dbd-toolbox', branch: 'test-toolbox', token: '', notifyPatches: true, ...(saved || {}) };

  $('inp-token').value = config.token;
  $('inp-repo').value = config.repo;
  $('inp-branch').value = config.branch;
  $('inp-notify').checked = config.notifyPatches !== false;
  if (!config.token) $('settings-panel').open = true;

  renderStatus(patchStatus, config);
  renderRunState(runState);

  if (!patchStatus) {
    chrome.runtime.sendMessage({ type: 'check-patch-now' }, (res) => {
      if (res?.status) renderStatus(res.status, config);
    });
  }
}

chrome.storage.onChanged.addListener(async (changes) => {
  const { config: saved, patchStatus, runState } = await chrome.storage.local.get(['config', 'patchStatus', 'runState']);
  const config = { repo: 'ARBSOLUTIONS/dbd-toolbox', branch: 'test-toolbox', token: '', notifyPatches: true, ...(saved || {}) };
  if (changes.patchStatus || changes.config) renderStatus(patchStatus, config);
  if (changes.runState) renderRunState(runState);
});

$('btn-update-all').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'start-update', mode: 'full', triggerWiki: true }, (res) => {
    if (res && !res.ok && res.error) {
      $('result-box').className = 'result-box err';
      $('result-box').textContent = res.error;
      if (res.error.includes('Token')) $('settings-panel').open = true;
    }
  });
});

$('btn-quick').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'start-update', mode: 'quick', triggerWiki: false }, (res) => {
    if (res && !res.ok && res.error) {
      $('result-box').className = 'result-box err';
      $('result-box').textContent = res.error;
      if (res.error.includes('Token')) $('settings-panel').open = true;
    }
  });
});

$('btn-cancel').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'cancel-update' });
});

$('btn-check').addEventListener('click', () => {
  $('patch-sub').textContent = 'Controleren…';
  chrome.runtime.sendMessage({ type: 'check-patch-now' });
});

$('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const config = {
    token: $('inp-token').value.trim(),
    repo: $('inp-repo').value.trim() || 'ARBSOLUTIONS/dbd-toolbox',
    branch: $('inp-branch').value,
    notifyPatches: $('inp-notify').checked,
  };
  await chrome.storage.local.set({ config });
  $('save-msg').classList.remove('hidden');
  setTimeout(() => $('save-msg').classList.add('hidden'), 1800);
  chrome.runtime.sendMessage({ type: 'check-patch-now' });
});

init();
