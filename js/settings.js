const Settings = {
  get(key, defaultValue = null) {
    try {
      return localStorage.getItem('pt_' + key) || defaultValue;
    } catch (e) {
      console.warn("localStorage not accessible:", e);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem('pt_' + key, value);
    } catch (e) {
      console.warn("localStorage not accessible:", e);
    }
  },

  getProvider() {
    return this.get('provider', 'gemini');
  },

  getApiKey() {
    return this.get('apiKey', '');
  },

  getGeminiModel() {
    return this.get('geminiModel', 'gemini-2.5-flash');
  },

  setGeminiModel(model) {
    this.set('geminiModel', model);
  }
};
