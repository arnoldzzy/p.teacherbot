const Dissector = {
  // Max characters per chunk (approx token limit guardrail)
  MAX_CHUNK_SIZE: 15000,

  async ingestFile(file, provider, apiKey) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const content = e.target.result;
          const chunks = this._chunkContent(content, file.name);
          
          let allConcepts = [];
          for (let i = 0; i < chunks.length; i++) {
            // Force Ollama for local extraction phase to save costs
            const concepts = await APIClient.processChunk(chunks[i], file.name, 'ollama', Settings.getApiKey());
            allConcepts = allConcepts.concat(concepts);
          }
          
          resolve(allConcepts);
        } catch (err) {
          reject(err);
        }
      };
      
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsText(file);
    });
  },

  // Lightweight tokenizer / chunker based on file boundaries
  _chunkContent(content, filename) {
    const ext = filename.split('.').pop().toLowerCase();
    
    // Fallback simple chunking if language not explicitly handled
    if (!['py', 'js', 'ts', 'java', 'c', 'cpp', 'cu', 'cs'].includes(ext)) {
      return this._basicChunk(content);
    }

    // Try to chunk by major blocks (classes, top-level functions)
    // This is a naive regex approach suitable for a client-side utility
    let chunks = [];
    let currentChunk = "";
    
    const lines = content.split('\n');
    
    // Regex for start of major blocks
    const blockStartRegex = /^(class |def |function |struct |interface |public class |namespace )/i;

    for (const line of lines) {
      if (blockStartRegex.test(line) && currentChunk.length > 500) {
        // Start of a new major block and current chunk is big enough
        chunks.push(currentChunk);
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
        
        // Safety guard for extremely long blocks
        if (currentChunk.length > this.MAX_CHUNK_SIZE) {
          chunks.push(currentChunk);
          currentChunk = "";
        }
      }
    }
    
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [content];
  },

  _basicChunk(content) {
    let chunks = [];
    let start = 0;
    while (start < content.length) {
      let end = start + this.MAX_CHUNK_SIZE;
      if (end < content.length) {
        // Try to break at a newline
        let breakIndex = content.lastIndexOf('\n', end);
        if (breakIndex > start) end = breakIndex;
      }
      chunks.push(content.substring(start, end));
      start = end + 1; // skip newline if we broke on it
    }
    return chunks;
  }
};
