// Monotonic Knowledge Tree State Manager using localForage (IndexedDB)

const StateManager = {
  db: null,
  nodes: [],
  edges: [],
  listeners: [],

  async init() {
    // Initialize localForage (assumes localforage script is loaded in HTML)
    this.db = localforage.createInstance({
      name: 'p_teacher_db',
      storeName: 'knowledge_tree'
    });

    const savedNodes = await this.db.getItem('nodes');
    const savedEdges = await this.db.getItem('edges');

    if (savedNodes) {
      // Migrate old statuses
      this.nodes = savedNodes.map(n => {
        if (n.status === 'VALIDATED') n.status = 'CONFIRMED';
        if (n.status === 'HYPOTHESIS') n.status = 'PENDING';
        return n;
      });
    }
    if (savedEdges) this.edges = savedEdges;
  },

  subscribe(callback) {
    this.listeners.push(callback);
  },

  _notify() {
    this.listeners.forEach(cb => cb({ nodes: this.nodes, edges: this.edges }));
  },

  async _save() {
    await this.db.setItem('nodes', this.nodes);
    await this.db.setItem('edges', this.edges);
    this._notify();
  },

  generateId() {
    return 'node_' + Math.random().toString(36).substr(2, 9);
  },

  // Monotonic Append
  async addNode(nodeData) {
    const node = {
      id: nodeData.id || this.generateId(),
      label: nodeData.label || 'New Concept',
      domain: nodeData.domain || 'default',
      status: nodeData.status || 'PENDING', // CONFIRMED, PARTIALLY_CONFIRMED, UNVERIFIED, DISPUTED, PENDING, UPDATE
      confidence: nodeData.confidence || 0,
      citations: nodeData.citations || [],
      validationDetails: nodeData.validationDetails || '',
      changeWeight: nodeData.changeWeight !== undefined ? nodeData.changeWeight : 1.0,
      description: nodeData.description || '',
      source: nodeData.source || 'Unknown',
      timestamp: new Date().toISOString(),
      ...nodeData
    };

    this.nodes.push(node);

    if (nodeData.parent_id) {
      this.edges.push({
        from: nodeData.parent_id,
        to: node.id,
        arrows: 'to',
        color: nodeData.status === 'UPDATE' ? { color: '#f87171', highlight: '#f87171' } : undefined,
        dashes: nodeData.status === 'UPDATE'
      });
    }

    if (nodeData.edges && Array.isArray(nodeData.edges)) {
      nodeData.edges.forEach(parentId => {
         this.edges.push({
          from: parentId,
          to: node.id,
          arrows: 'to'
        });
      });
    }

    await this._save();
    return node;
  },

  // Never mutates existing node. Appends an UPDATE node.
  async addRevision(targetId, newData) {
    const revisionNode = {
      ...newData,
      status: 'UPDATE',
      parent_id: targetId,
      label: `[REV] ${newData.label || 'Update'}`
    };
    return await this.addNode(revisionNode);
  },

  async clear() {
    this.nodes = [];
    this.edges = [];
    await this.db.clear();
    this._notify();
  },

  exportState() {
    return JSON.stringify({ nodes: this.nodes, edges: this.edges }, null, 2);
  },

  async importState(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.nodes && data.edges) {
        // Monotonic append: we could merge, but for now we just load
        this.nodes = data.nodes;
        this.edges = data.edges;
        await this._save();
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to import state', e);
      return false;
    }
  }
};
