const DirectoryWatcher = {
  directoryHandle: null,
  pollInterval: 10000, // 10 seconds
  intervalId: null,

  async selectDirectory() {
    try {
      this.directoryHandle = await window.showDirectoryPicker();
      this.startPolling();
      alert(`Started monitoring directory: ${this.directoryHandle.name}`);
      // Initial scan
      await this.scanDirectory();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error("Directory selection failed:", err);
        alert("Failed to select directory: " + err.message);
      }
    }
  },

  startPolling() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.scanDirectory(), this.pollInterval);
  },

  stopPolling() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.directoryHandle = null;
  },

  async scanDirectory() {
    if (!this.directoryHandle) return;
    
    // UI update
    const statusEl = document.getElementById('watcher-status');
    if (statusEl) statusEl.textContent = `Scanning ${this.directoryHandle.name}...`;

    await this._traverseDirectory(this.directoryHandle, "");

    if (statusEl) statusEl.textContent = `Monitoring ${this.directoryHandle.name}`;
  },

  async _traverseDirectory(dirHandle, path) {
    for await (const entry of dirHandle.values()) {
      const fullPath = path ? `${path}/${entry.name}` : entry.name;
      
      // Skip node_modules and hidden folders
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

      if (entry.kind === 'file') {
        await this._checkFile(entry, fullPath);
      } else if (entry.kind === 'directory') {
        await this._traverseDirectory(entry, fullPath);
      }
    }
  },

  async _checkFile(fileHandle, fullPath) {
    try {
      const file = await fileHandle.getFile();
      
      // Only process text-like files based on extension
      const ext = fullPath.split('.').pop().toLowerCase();
      const validExts = ['js', 'py', 'html', 'css', 'ts', 'java', 'c', 'cpp', 'cu', 'md', 'json'];
      if (!validExts.includes(ext)) return;

      const lastModified = file.lastModified;
      const record = await FileRegistry.getFileRecord(fullPath);

      if (!record || record.lastModified < lastModified) {
        // Compute simple hash based on content length for now
        // A true hash would require reading the file, but this is a lightweight first check
        const text = await file.text();
        const hash = this._simpleHash(text);
        
        if (!record || record.hash !== hash) {
          console.log(`File changed: ${fullPath}`);
          await FileRegistry.updateFileRecord(fullPath, lastModified, hash);
          
          // Trigger pipeline automatically
          if (window.handleFiles) {
              // Create a File object that includes the full path for context
              const fileObj = new File([text], fullPath, { type: file.type, lastModified: file.lastModified });
              await window.handleFiles([fileObj]);
          }
        } else {
          // Date changed but content is same
          await FileRegistry.updateFileRecord(fullPath, lastModified, hash);
        }
      }
    } catch (e) {
      console.error(`Failed to check file ${fullPath}:`, e);
    }
  },
  
  _simpleHash(str) {
      let hash = 0;
      for (let i = 0, len = str.length; i < len; i++) {
          let chr = str.charCodeAt(i);
          hash = (hash << 5) - hash + chr;
          hash |= 0; // Convert to 32bit integer
      }
      return hash.toString();
  }
};
