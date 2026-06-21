const ReviewQueue = {
  selectedNodes: new Set(),
  
  init() {
    this.renderQueue();
    // Subscribe to state changes to re-render queue
    StateManager.subscribe(() => this.renderQueue());
  },

  renderQueue() {
    const queueContainer = document.getElementById('review-queue-list');
    if (!queueContainer) return;

    // Get nodes that need validation (e.g., PENDING or UNVERIFIED)
    const reviewableNodes = StateManager.nodes.filter(n => n.status === 'PENDING' || n.status === 'UNVERIFIED');
    
    if (reviewableNodes.length === 0) {
      queueContainer.innerHTML = `<p style="color: var(--text-secondary); text-align: center;">No pending nodes to review.</p>`;
      this.updateValidationButton();
      return;
    }

    let html = '';
    reviewableNodes.forEach(node => {
      const isChecked = this.selectedNodes.has(node.id) ? 'checked' : '';
      const domainCfg = Domains.getDomain(node.domain);
      
      html += `
        <div class="queue-item" style="border: 1px solid var(--border-glass); padding: 0.5rem; margin-bottom: 0.5rem; border-radius: 4px; display: flex; align-items: flex-start; gap: 0.5rem;">
          <input type="checkbox" class="queue-checkbox" data-id="${node.id}" ${isChecked} style="margin-top: 0.25rem;">
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>${node.label}</strong>
              <span class="domain-badge" style="background: ${domainCfg.color}20; color: ${domainCfg.color}; font-size: 0.7rem;">${domainCfg.label}</span>
            </div>
            <p style="font-size: 0.8rem; margin: 0.25rem 0; color: var(--text-secondary);">${node.description}</p>
            <div style="font-size: 0.7rem; color: var(--text-secondary);">Confidence: ${(node.confidence * 100).toFixed(0)}% | Source: ${node.source}</div>
          </div>
        </div>
      `;
    });

    queueContainer.innerHTML = html;

    // Bind checkboxes
    queueContainer.querySelectorAll('.queue-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) {
          this.selectedNodes.add(id);
        } else {
          this.selectedNodes.delete(id);
        }
        this.updateValidationButton();
      });
    });
    
    this.updateValidationButton();
  },

  selectAll() {
    const reviewableNodes = StateManager.nodes.filter(n => n.status === 'PENDING' || n.status === 'UNVERIFIED');
    reviewableNodes.forEach(n => this.selectedNodes.add(n.id));
    this.renderQueue();
  },

  deselectAll() {
    this.selectedNodes.clear();
    this.renderQueue();
  },

  updateValidationButton() {
    const btn = document.getElementById('btn-validate-selected');
    const costEstimate = document.getElementById('validation-cost-estimate');
    if (!btn || !costEstimate) return;

    const count = this.selectedNodes.size;
    btn.disabled = count === 0;
    btn.textContent = `Validate ${count} Nodes via Gemini`;
    
    // Rough estimate: ~500 tokens input, ~200 tokens output per node. Very rough.
    const estimatedTokens = count * 700;
    costEstimate.textContent = `Est. tokens: ${estimatedTokens}`;
  },

  async validateSelected() {
    if (this.selectedNodes.size === 0) return;

    const apiKey = Settings.getApiKey();
    if (!apiKey) {
      alert("Please configure your API Key in Settings.");
      return;
    }
    
    if (Settings.getProvider() !== 'gemini') {
      alert("Please select Google Gemini as your provider in Settings for scientific validation.");
      return;
    }

    const loader = document.getElementById('loader');
    const loaderText = document.getElementById('loader-text');
    loader.classList.add('active');

    try {
      const nodeIdsArray = Array.from(this.selectedNodes);
      loaderText.innerText = `Validating ${nodeIdsArray.length} node(s) via Gemini...`;
      
      const results = await Validator.validateNodes(
        nodeIdsArray, 
        Settings.getProvider(), 
        apiKey, 
        Settings.getGeminiModel()
      );
      
      alert(`Validation complete! Successfully processed ${results.length} nodes.`);
      this.selectedNodes.clear();
      // StateManager.addRevision automatically notifies listeners, so queue will re-render
      
    } catch(err) {
      console.error(err);
      alert("Validation failed: " + err.message);
    } finally {
      loader.classList.remove('active');
    }
  }
};
