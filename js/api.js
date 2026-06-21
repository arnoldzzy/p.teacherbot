// Multi-provider LLM API client

const APIClient = {
  async processChunk(chunkText, filename, provider, apiKey, modelName) {
    if (!apiKey) {
      throw new Error("API Key not configured. Please set it in Settings.");
    }
    apiKey = apiKey.trim();

    const systemPrompt = `You are p.teacher, an advanced pedagogical agent and expert code dissector.
Analyze the following code/text chunk from file "${filename}".
Extract atomic knowledge concepts. For each concept, provide:
1. label: Short name (max 5 words)
2. description: Detailed explanation of the concept and its systemic logic.
3. domain: Classify as one of [hardware, software, ai, macro].
4. confidence: A score between 0.0 and 1.0 representing how certain you are.

Respond ONLY with a valid JSON array of objects. Example:
[
  { "label": "CUDA Kernel Launch", "description": "...", "domain": "hardware", "confidence": 0.9 }
]`;

    try {
      let jsonResponse = "[]";
      
      let requestFn = async () => {
        if (provider === 'gemini') {
          return await this._callGemini(chunkText, systemPrompt, apiKey, modelName);
        } else if (provider === 'anthropic') {
          return await this._callAnthropic(chunkText, systemPrompt, apiKey, modelName);
        } else if (provider === 'openai') {
          return await this._callOpenAI(chunkText, systemPrompt, apiKey, modelName);
        } else if (provider === 'ollama') {
          return await this._callOllama(chunkText, systemPrompt, modelName || apiKey);
        }
        return "[]";
      };

      if (typeof RateLimiter !== 'undefined' && provider === 'gemini') {
        let estimatedTokens = RateLimiter.estimateTokens(chunkText + systemPrompt);
        jsonResponse = await RateLimiter.enqueue(requestFn, estimatedTokens);
      } else {
        jsonResponse = await requestFn();
      }

      // Cleanup markdown code blocks if present
      jsonResponse = jsonResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonResponse);

    } catch (err) {
      console.error("API Error:", err);
      throw err;
    }
  },

  async fetchAvailableModels(apiKey) {
    if (!apiKey) return [];
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const data = await response.json();
      if (!data.models) return [];
      
      // Filter for models that support text generation
      const validModels = data.models.filter(m => 
        m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
      );
      
      // Extract just the model name part (e.g. "models/gemini-1.5-flash" -> "gemini-1.5-flash")
      return validModels.map(m => m.name.replace('models/', ''));
    } catch (err) {
      console.error("Failed to fetch models:", err);
      return [];
    }
  },

  async _callOllama(text, systemPrompt, modelName) {
    const url = 'http://127.0.0.1:11434/api/chat';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName || 'qwen:7b',
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        format: 'json'
      })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama error! Make sure Ollama is running and CORS is configured. status: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    return data.message.content;
  },

  async _callGemini(text, systemPrompt, apiKey, modelName) {
    const model = modelName || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    let retries = 0;
    const maxRetries = 3;
    
    while (retries <= maxRetries) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text }] }]
        })
      });
      
      if (!response.ok) {
        if (response.status === 429 && retries < maxRetries) {
          retries++;
          const delay = Math.pow(2, retries) * 1000; // 2s, 4s, 8s
          console.warn(`Gemini API rate limited (429). Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        const errText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errText}`);
      }
      
      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    }
  },

  async _callAnthropic(text, systemPrompt, apiKey, modelName) {
    const url = 'https://api.anthropic.com/v1/messages';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true' // Required for client-side Anthropic calls
      },
      body: JSON.stringify({
        model: modelName || 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: text }]
      })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    return data.content[0].text;
  },

  async _callOpenAI(text, systemPrompt, apiKey, modelName) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        response_format: { type: "json_object" } // Using json object for robust parsing
      })
    });
    
    if (!response.ok) {
        const errText = await response.text();
        // If 404, the model gpt-4o-mini might not be available, fallback could be tested but let's just show the error.
        throw new Error(`HTTP error! status: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    
    // OpenAI with json_object format requires returning an object, so we might need to handle { "concepts": [...] }
    const content = data.choices[0].message.content;
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed) && parsed.concepts) {
        return JSON.stringify(parsed.concepts);
    }
    return content;
  }
};
