const ScientificAPIs = {
  async search(query) {
    // Run both arXiv and Semantic Scholar in parallel
    const [arxivResults, s2Results] = await Promise.all([
      this._searchArxiv(query).catch(e => { console.error("arXiv error:", e); return []; }),
      this._searchSemanticScholar(query).catch(e => { console.error("S2 error:", e); return []; })
    ]);

    // Combine and deduplicate
    const combined = [...s2Results, ...arxivResults];
    const unique = [];
    const seenTitles = new Set();

    for (const paper of combined) {
      const normalizedTitle = paper.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seenTitles.has(normalizedTitle)) {
        seenTitles.add(normalizedTitle);
        unique.push(paper);
      }
    }

    // Return top 3 unique results
    return unique.slice(0, 3);
  },

  async _searchArxiv(query) {
    const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=3`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`arXiv error: ${response.status}`);
    
    const text = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    
    const entries = xmlDoc.getElementsByTagName("entry");
    const results = [];
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const title = entry.getElementsByTagName("title")[0]?.textContent || "Unknown Title";
      const summary = entry.getElementsByTagName("summary")[0]?.textContent || "";
      const published = entry.getElementsByTagName("published")[0]?.textContent || "";
      const year = published ? new Date(published).getFullYear() : "Unknown Year";
      
      const authors = [];
      const authorNodes = entry.getElementsByTagName("author");
      for (let j = 0; j < authorNodes.length; j++) {
        authors.push(authorNodes[j].getElementsByTagName("name")[0]?.textContent || "");
      }
      
      results.push({
        title: title.trim().replace(/\n/g, ' '),
        abstract: summary.trim().replace(/\n/g, ' '),
        authors: authors.slice(0, 3).join(", ") + (authors.length > 3 ? " et al." : ""),
        year,
        source: "arXiv"
      });
    }
    
    // Polite delay for arXiv
    await new Promise(r => setTimeout(r, 1000));
    return results;
  },

  async _searchSemanticScholar(query) {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=3&fields=title,abstract,authors,year`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Semantic Scholar error: ${response.status}`);
    
    const data = await response.json();
    if (!data.data) return [];
    
    return data.data.map(paper => ({
      title: paper.title || "Unknown Title",
      abstract: paper.abstract || "No abstract available.",
      authors: (paper.authors || []).map(a => a.name).slice(0, 3).join(", ") + (paper.authors && paper.authors.length > 3 ? " et al." : ""),
      year: paper.year || "Unknown Year",
      source: "Semantic Scholar"
    }));
  }
};
