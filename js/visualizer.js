const Visualizer = {
  network: null,
  container: null,
  hiddenDomains: new Set(),

  init(containerId) {
    this.container = document.getElementById(containerId);
    
    const options = {
      nodes: {
        shape: 'box',
        margin: 10,
        borderWidth: 2,
        shadow: true,
        font: { color: '#f8fafc', face: 'Inter', size: 14 }
      },
      edges: {
        width: 2,
        shadow: true,
        smooth: { type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.4 }
      },
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'UD', // Up-Down
          sortMethod: 'directed',
          nodeSpacing: 150,
          levelSeparation: 150
        }
      },
      physics: {
        hierarchicalRepulsion: {
          centralGravity: 0.0,
          springLength: 100,
          springConstant: 0.01,
          nodeDistance: 150,
          damping: 0.09
        },
        solver: 'hierarchicalRepulsion'
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        zoomView: true,
        dragView: true
      }
    };

    this.network = new vis.Network(this.container, { nodes: [], edges: [] }, options);

    // Subscribe to monotonic state updates
    StateManager.subscribe((state) => this._updateGraph(state));
    
    // Initial render if state already exists
    if (StateManager.nodes.length > 0) {
      this._updateGraph({ nodes: StateManager.nodes, edges: StateManager.edges });
    }
  },

  _updateGraph(state) {
    if (!this.network) return;

    // Apply domain filters
    const visibleNodes = state.nodes.filter(n => !this.hiddenDomains.has(n.domain));
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = state.edges.filter(e => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to));

    // Map state to vis.js format
    const visNodes = visibleNodes.map(node => {
      const domainCfg = Domains.getDomain(node.domain);
      
      let borderCol = domainCfg.color;
      let borderDashes = false;
      let borderWidth = 2;

      // Status Colors
      if (node.status === 'CONFIRMED') {
        borderCol = '#10b981'; // Green
      } else if (node.status === 'PARTIALLY_CONFIRMED') {
        borderCol = '#3b82f6'; // Blue
      } else if (node.status === 'UNVERIFIED') {
        borderCol = '#64748b'; // Gray
      } else if (node.status === 'DISPUTED') {
        borderCol = '#ef4444'; // Red
      } else if (node.status === 'PENDING') {
        borderCol = '#fbbf24'; // Amber
        borderDashes = [5, 5];
      } else if (node.status === 'UPDATE') {
        borderCol = '#f87171'; // Light Red for revision
        borderDashes = [2, 2];
      }

      // Base confidence on border width
      if (node.confidence) {
          borderWidth = Math.max(1, Math.min(5, Math.ceil(node.confidence * 4)));
      }

      return {
        id: node.id,
        label: this._wrapText(node.label, 20),
        title: `Domain: ${domainCfg.label}\nStatus: ${node.status}\nConfidence: ${((node.confidence || 0) * 100).toFixed(0)}%\nSource: ${node.source}`, // Tooltip
        borderWidth,
        shapeProperties: { borderDashes: borderDashes },
        color: {
          background: 'rgba(15, 23, 42, 0.8)',
          border: borderCol,
          highlight: { background: 'rgba(30, 41, 59, 1)', border: borderCol }
        }
      };
    });

    const visEdges = visibleEdges.map(edge => ({
      ...edge,
      color: edge.dashes ? { color: '#ef4444', highlight: '#ef4444' } : { color: '#64748b', highlight: '#94a3b8' }
    }));

    this.network.setData({ nodes: visNodes, edges: visEdges });
  },

  toggleDomainFilter(domainId, isVisible) {
    if (isVisible) {
      this.hiddenDomains.delete(domainId);
    } else {
      this.hiddenDomains.add(domainId);
    }
    // Re-render
    this._updateGraph({ nodes: StateManager.nodes, edges: StateManager.edges });
  },

  _wrapText(text, maxLength) {
    const words = text.split(' ');
    let lines = [];
    let currentLine = '';

    words.forEach(word => {
      if ((currentLine + word).length > maxLength) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine += word + ' ';
      }
    });
    lines.push(currentLine.trim());
    return lines.join('\n');
  },

  onNodeClick(callback) {
    this.network.on("selectNode", function (params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const nodeData = StateManager.nodes.find(n => n.id === nodeId);
        if (nodeData) callback(nodeData);
      }
    });
  }
};
