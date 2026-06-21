
document.addEventListener('DOMContentLoaded', async () => {
  // Bind UI immediately to ensure responsiveness
  bindTabs();
  
  try {
    bindSettings();
    bindFileDrop();

    // 1. Initialize State (localForage IndexedDB)
    await StateManager.init();
    await FileRegistry.init();

    // 2. Initialize Visualizer
    Visualizer.init('knowledge-tree');
    
    // 3. Initialize Review Queue
    if (typeof ReviewQueue !== 'undefined') {
      ReviewQueue.init();
      bindReviewQueue();
    }

    bindNodeClick();
    buildDomainFilters();
  } catch (e) {
    console.error("Initialization error:", e);
    alert("Warning: Could not initialize database. If you are running directly from a file:// URL, some browsers block storage. Try running via a local server (e.g. npx http-server). Error: " + e.message);
  }
});

function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      
      e.target.classList.add('active');
      document.getElementById(e.target.dataset.target).classList.add('active');
    });
  });

  const sidebar = document.getElementById('sidebar');
  document.getElementById('toggle-sidebar').addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });
}

function bindSettings() {
  const providerSelect = document.getElementById('api-provider');
  const apiKeyInput = document.getElementById('api-key');
  const geminiModelGroup = document.getElementById('gemini-model-group');
  const geminiModelSelect = document.getElementById('gemini-model');
  const btnRefreshModels = document.getElementById('btn-refresh-models');
  const geminiModelStatus = document.getElementById('gemini-model-status');
  
  providerSelect.value = Settings.getProvider();
  apiKeyInput.value = Settings.getApiKey();

  // Load Gemini model setting
  const savedModel = Settings.getGeminiModel();
  if (savedModel && !geminiModelSelect.querySelector(`option[value="${savedModel}"]`)) {
    const opt = document.createElement('option');
    opt.value = savedModel;
    opt.textContent = savedModel;
    geminiModelSelect.appendChild(opt);
  }
  geminiModelSelect.value = savedModel;

  const updateGeminiVisibility = () => {
    if (providerSelect.value === 'gemini') {
      geminiModelGroup.style.display = 'block';
    } else {
      geminiModelGroup.style.display = 'none';
    }
  };
  
  updateGeminiVisibility();

  const loadGeminiModels = async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) return;
    
    geminiModelStatus.textContent = 'Fetching models...';
    btnRefreshModels.disabled = true;
    
    try {
      const models = await APIClient.fetchAvailableModels(apiKey);
      if (models.length > 0) {
        geminiModelSelect.innerHTML = '';
        models.forEach(model => {
          const opt = document.createElement('option');
          opt.value = model;
          opt.textContent = model;
          geminiModelSelect.appendChild(opt);
        });
        
        // Restore selection if still valid, otherwise use first
        if (models.includes(Settings.getGeminiModel())) {
          geminiModelSelect.value = Settings.getGeminiModel();
        } else {
          Settings.setGeminiModel(models[0]);
        }
        geminiModelStatus.textContent = `Found ${models.length} models.`;
      } else {
        geminiModelStatus.textContent = 'No models found or API key invalid.';
      }
    } catch (e) {
      geminiModelStatus.textContent = 'Failed to fetch models.';
    } finally {
      btnRefreshModels.disabled = false;
    }
  };

  providerSelect.addEventListener('input', (e) => {
    Settings.set('provider', e.target.value);
    updateGeminiVisibility();
  });
  
  apiKeyInput.addEventListener('input', (e) => {
    Settings.set('apiKey', e.target.value);
  });
  
  geminiModelSelect.addEventListener('input', (e) => {
    Settings.setGeminiModel(e.target.value);
  });
  
  btnRefreshModels.addEventListener('click', loadGeminiModels);

  // Rate Limiter UI
  const apiRpmInput = document.getElementById('api-rpm');
  if (typeof RateLimiter !== 'undefined') {
    apiRpmInput.value = RateLimiter.rpm;
    apiRpmInput.addEventListener('input', (e) => {
      RateLimiter.setRPM(parseInt(e.target.value, 10));
    });

    window.updateRateLimiterUI = () => {
      const status = RateLimiter.getStatus();
      const uiTotalTokens = document.getElementById('ui-total-tokens');
      const uiQueueStatus = document.getElementById('ui-queue-status');
      if (uiTotalTokens && uiQueueStatus) {
        uiTotalTokens.textContent = status.totalTokens.toLocaleString();
        uiQueueStatus.textContent = `${status.queued} pending / ${status.inProgress} in-progress`;
      }
    };
    window.updateRateLimiterUI();
  }

  document.getElementById('btn-export').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(StateManager.exportState());
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "knowledge_tree.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  });

  document.getElementById('btn-clear').addEventListener('click', async () => {
    if (confirm("Are you sure you want to delete the entire knowledge tree?")) {
      await StateManager.clear();
      updateBriefPanel("System cleared.", []);
    }
  });
}

function bindFileDrop() {
  const dropZone = document.getElementById('file-drop-zone');
  const fileInput = document.getElementById('file-upload');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      handleFiles(e.target.files);
    }
  });

  const btnSelectFolder = document.getElementById('btn-select-folder');
  if (btnSelectFolder) {
    btnSelectFolder.addEventListener('click', async () => {
      if (typeof DirectoryWatcher !== 'undefined') {
        await DirectoryWatcher.selectDirectory();
      }
    });
  }
}

// Make handleFiles global for DirectoryWatcher to access
window.handleFiles = async function handleFiles(files) {
  const apiKey = Settings.getApiKey();
  if (!apiKey) {
    alert("Please configure your API Key in the Settings tab first.");
    return;
  }

  const loader = document.getElementById('loader');
  loader.classList.add('active');

  try {
    for (const file of files) {
      document.getElementById('loader-text').innerText = `Dissecting ${file.name}...`;
      
      // 1. Ingest & Extract via LLM
      const extractedConcepts = await Dissector.ingestFile(file, Settings.getProvider(), apiKey, Settings.getGeminiModel());
      
      // 2. Validate & Append to Monotonic State (as PENDING)
      const validatedNodes = await Validator.processExtractedConcepts(extractedConcepts, file.name);

      // 3. Update Brief UI
      updateBriefPanel(file.name, validatedNodes);
    }
  } catch (err) {
    console.error(err);
    alert("An error occurred during dissection: " + err.message);
  } finally {
    loader.classList.remove('active');
  }
}

function updateBriefPanel(sourceName, nodes) {
  const briefContent = document.getElementById('brief-content');
  
  if (nodes.length === 0) {
    briefContent.innerHTML = `<p style="color: var(--text-secondary)">No nodes added/updated for ${sourceName}.</p>`;
    return;
  }

  let html = `<h3>Source Digested: ${sourceName}</h3><div style="margin-top: 1rem;">`;
  
  nodes.forEach(node => {
    const domainCfg = Domains.getDomain(node.domain);
    html += `
      <div class="brief-item">
        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
          <span class="domain-badge" style="background: ${domainCfg.color}20; color: ${domainCfg.color}">${domainCfg.label}</span>
          <span class="status-badge status-${node.status}">${node.status}</span>
        </div>
        <h4>${node.label}</h4>
        <p>${node.description}</p>
      </div>
    `;
  });
  
  html += `</div>`;
  briefContent.innerHTML = html;

  // Switch to brief tab automatically
  document.querySelector('[data-target="pane-brief"]').click();
}

function bindReviewQueue() {
  document.getElementById('btn-queue-select-all').addEventListener('click', () => {
    ReviewQueue.selectAll();
  });
  document.getElementById('btn-queue-deselect-all').addEventListener('click', () => {
    ReviewQueue.deselectAll();
  });
  document.getElementById('btn-validate-selected').addEventListener('click', () => {
    ReviewQueue.validateSelected();
  });
}

function bindNodeClick() {
  Visualizer.onNodeClick((nodeData) => {
    const infoPanel = document.getElementById('node-info-panel');
    const domainCfg = Domains.getDomain(nodeData.domain);
    
    infoPanel.innerHTML = `
      <div class="node-meta">
        <span class="domain-badge" style="background: ${domainCfg.color}20; color: ${domainCfg.color}">${domainCfg.label}</span>
        <span class="status-badge status-${nodeData.status}">${nodeData.status}</span>
      </div>
      <h3 style="margin-top: 0.5rem; color: var(--text-accent);">${nodeData.label}</h3>
      <p style="font-size: 0.875rem; line-height: 1.5;">${nodeData.description}</p>
      <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem; border-top: 1px solid var(--border-glass); padding-top: 0.5rem;">
        Source: ${nodeData.source}<br>
        Added: ${new Date(nodeData.timestamp).toLocaleString()}
      </div>
    `;
    
    // Switch to graph info tab
    document.querySelector('[data-target="pane-info"]').click();
  });
}

function buildDomainFilters() {
  const filterContainer = document.getElementById('domain-filters');
  const domains = Domains.getAll();
  
  domains.forEach(d => {
    if (d.id === 'default') return; // Skip general if you want, or include it
    
    const label = document.createElement('label');
    label.className = 'checkbox-group';
    label.innerHTML = `
      <input type="checkbox" checked data-domain="${d.id}">
      <span style="color: ${d.color}">■</span> ${d.label}
    `;
    
    label.querySelector('input').addEventListener('change', (e) => {
      Visualizer.toggleDomainFilter(d.id, e.target.checked);
    });
    
    filterContainer.appendChild(label);
  });
}
