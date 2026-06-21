const RateLimiter = {
  rpm: 10, // Default for free tier
  queue: [],
  inProgress: 0,
  completed: 0,
  totalTokens: 0,
  lastCallTime: 0,
  isProcessing: false,

  init() {
    this.rpm = parseInt(Settings.get('rpm', '10'), 10);
    this.totalTokens = parseInt(Settings.get('totalTokens', '0'), 10);
  },

  setRPM(newRpm) {
    this.rpm = newRpm;
    Settings.set('rpm', newRpm);
  },

  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  },

  addTokens(count) {
    this.totalTokens += count;
    Settings.set('totalTokens', this.totalTokens.toString());
  },

  async enqueue(requestFn, estimatedTokens) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, estimatedTokens, resolve, reject });
      this._processQueue();
    });
  },

  async _processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const delayBetweenCalls = 60000 / this.rpm;
      const timeSinceLastCall = now - this.lastCallTime;

      if (timeSinceLastCall < delayBetweenCalls) {
        await new Promise(r => setTimeout(r, delayBetweenCalls - timeSinceLastCall));
      }

      const task = this.queue.shift();
      this.inProgress++;
      this.lastCallTime = Date.now();
      
      // Update UI if needed
      if (window.updateRateLimiterUI) window.updateRateLimiterUI();

      try {
        const result = await task.requestFn();
        this.addTokens(task.estimatedTokens);
        task.resolve(result);
      } catch (e) {
        task.reject(e);
      } finally {
        this.inProgress--;
        this.completed++;
        if (window.updateRateLimiterUI) window.updateRateLimiterUI();
      }
    }

    this.isProcessing = false;
  },

  getStatus() {
    return {
      queued: this.queue.length,
      inProgress: this.inProgress,
      completed: this.completed,
      totalTokens: this.totalTokens,
      rpm: this.rpm
    };
  }
};

// Initialize when loaded
RateLimiter.init();
