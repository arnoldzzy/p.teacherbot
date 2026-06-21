const Validator = {
  // 1. Ingestion logic (runs immediately after local LLM extraction)
  async processExtractedConcepts(concepts, sourceFilename) {
    const nodes = [];

    for (const concept of concepts) {
      const domain = Domains.classify(concept.domain || concept.label + ' ' + concept.description);
      
      const existingMatch = StateManager.nodes.find(n => 
        n.label.toLowerCase() === concept.label.toLowerCase() ||
        (n.description && concept.description && this._calculateSimilarity(n.description, concept.description) > 0.8)
      );

      let node;
      if (existingMatch) {
        node = await StateManager.addRevision(existingMatch.id, {
          label: concept.label,
          description: concept.description,
          domain: domain,
          source: sourceFilename,
          confidence: concept.confidence || 0,
          status: 'UPDATE'
        });
      } else {
        node = await StateManager.addNode({
          label: concept.label,
          description: concept.description,
          domain: domain,
          source: sourceFilename,
          confidence: concept.confidence || 0,
          status: 'PENDING'
        });
      }

      nodes.push(node);
    }

    return nodes;
  },

  // 2. Explicit Validation Logic (triggered by user via Review Queue)
  async validateNodes(nodeIds, provider, apiKey, modelName) {
    if (provider !== 'gemini') {
        throw new Error("Only Gemini is supported for deep scientific validation.");
    }

    const nodesToValidate = StateManager.nodes.filter(n => nodeIds.includes(n.id));
    if (nodesToValidate.length === 0) return [];

    const results = [];

    // Process in batches or one by one
    for (const node of nodesToValidate) {
        // Step A: Ask Gemini for search queries
        const queryPrompt = `You are a scientific research assistant. We need to validate the following concept extracted from source code/documentation.
Concept: ${node.label}
Description: ${node.description}

Provide 1-2 highly specific search queries to find scientific literature (arXiv, Semantic Scholar) that validates or refutes this concept's systemic logic.
Return ONLY a JSON array of strings. Example: ["search query 1", "search query 2"]`;

        let queries = [];
        try {
            let queryRes = await this._runGeminiPrompt(queryPrompt, provider, apiKey, modelName);
            queryRes = queryRes.replace(/```json/g, '').replace(/```/g, '').trim();
            queries = JSON.parse(queryRes);
        } catch(e) {
            console.error("Failed to generate queries for node", node.id, e);
            continue;
        }

        // Step B: Fetch scientific literature
        let allLiterature = [];
        for (const q of queries.slice(0, 2)) {
            const papers = await ScientificAPIs.search(q);
            allLiterature = allLiterature.concat(papers);
        }

        // Step C: Ask Gemini to synthesize and assign final status
        const literatureContext = allLiterature.map((p, i) => `[Paper ${i+1}] ${p.title} (${p.year}) - ${p.authors}\nAbstract: ${p.abstract}`).join('\n\n');
        
        const evalPrompt = `You are a strict scientific validator. Evaluate the concept against the provided literature.
Concept: ${node.label}
Description: ${node.description}

Literature:
${literatureContext || "No relevant literature found."}

Assign one of these statuses based strictly on the literature:
- CONFIRMED: Strongly supported by the literature.
- PARTIALLY_CONFIRMED: Elements are supported, but some nuances are missing or slightly off.
- UNVERIFIED: No relevant literature found to confirm or refute.
- DISPUTED: Literature contradicts the concept.

Provide a JSON response:
{
  "status": "...",
  "validationDetails": "A short summary of why this status was chosen, citing specific papers if applicable.",
  "citations": ["List of paper titles used for validation"]
}`;

        try {
            let evalRes = await this._runGeminiPrompt(evalPrompt, provider, apiKey, modelName);
            evalRes = evalRes.replace(/```json/g, '').replace(/```/g, '').trim();
            const evaluation = JSON.parse(evalRes);
            
            const updatedNode = await StateManager.addRevision(node.id, {
                label: node.label,
                description: node.description,
                domain: node.domain,
                source: node.source,
                status: evaluation.status || 'UNVERIFIED',
                validationDetails: evaluation.validationDetails || '',
                citations: evaluation.citations || []
            });
            results.push(updatedNode);
            
        } catch (e) {
            console.error("Failed to evaluate node", node.id, e);
        }
    }

    return results;
  },

  async _runGeminiPrompt(prompt, provider, apiKey, modelName) {
      if (typeof RateLimiter !== 'undefined') {
          return await RateLimiter.enqueue(async () => {
              return await APIClient._callGemini("", prompt, apiKey, modelName);
          }, RateLimiter.estimateTokens(prompt));
      } else {
          return await APIClient._callGemini("", prompt, apiKey, modelName);
      }
  },

  _calculateSimilarity(str1, str2) {
    const set1 = new Set(str1.toLowerCase().split(/\W+/));
    const set2 = new Set(str2.toLowerCase().split(/\W+/));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / (union.size || 1);
  }
};
