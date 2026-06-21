const Domains = {
  REGISTRY: {
    'hardware': { id: 'hardware', label: 'Hardware Engineering', color: '#06b6d4', keywords: [{term: 'gpu', weight: 2}, {term: 'cpu', weight: 1.5}, {term: 'cuda', weight: 3}, {term: 'silicon', weight: 2}, {term: 'memory', weight: 1}, {term: 'cache', weight: 1.5}, {term: 'register', weight: 1}, {term: 'instruction', weight: 1}] },
    'software': { id: 'software', label: 'Software Engineering', color: '#10b981', keywords: [{term: 'api', weight: 1.5}, {term: 'function', weight: 1}, {term: 'class', weight: 1}, {term: 'loop', weight: 1}, {term: 'pattern', weight: 1}, {term: 'architecture', weight: 1.5}, {term: 'database', weight: 2}, {term: 'frontend', weight: 2}, {term: 'backend', weight: 2}] },
    'ai': { id: 'ai', label: 'AI / Robotics', color: '#d946ef', keywords: [{term: 'transformer', weight: 3}, {term: 'attention', weight: 2}, {term: 'model', weight: 1.5}, {term: 'training', weight: 1.5}, {term: 'inference', weight: 2}, {term: 'neural', weight: 2}, {term: 'weights', weight: 1}, {term: 'embodied', weight: 3}] },
    'macro': { id: 'macro', label: 'Macroeconomic Strategy', color: '#f59e0b', keywords: [{term: 'policy', weight: 1.5}, {term: 'economy', weight: 2}, {term: 'manufacturing', weight: 2}, {term: 'subsidy', weight: 3}, {term: 'geopolitics', weight: 3}, {term: 'supply chain', weight: 2}, {term: 'deployment', weight: 1}] },
    'default': { id: 'default', label: 'General', color: '#64748b', keywords: [] }
  },

  getDomain(id) {
    return this.REGISTRY[id] || this.REGISTRY['default'];
  },

  getAll() {
    return Object.values(this.REGISTRY);
  },

  registerDomain(id, config) {
    this.REGISTRY[id] = { ...this.REGISTRY['default'], ...config, id };
  },

  classify(text) {
    const lowerText = text.toLowerCase();
    let bestMatch = 'default';
    let maxScore = 0;

    for (const [id, domain] of Object.entries(this.REGISTRY)) {
      if (id === 'default') continue;
      let score = 0;
      for (const kw of domain.keywords) {
        if (lowerText.includes(kw.term)) {
          score += kw.weight;
        }
      }
      if (score > maxScore) {
        maxScore = score;
        bestMatch = id;
      }
    }
    return bestMatch;
  }
};
