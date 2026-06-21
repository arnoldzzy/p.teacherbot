const FileRegistry = {
  db: null,

  async init() {
    this.db = localforage.createInstance({
      name: 'p_teacher_db',
      storeName: 'file_registry'
    });
  },

  async getFileRecord(path) {
    return await this.db.getItem(path);
  },

  async updateFileRecord(path, lastModified, hash = null) {
    await this.db.setItem(path, { lastModified, hash, updated: Date.now() });
  },

  async clear() {
    await this.db.clear();
  }
};
