import fs from 'fs';
import path from 'path';

// Ephemeral in-memory fallback for Vercel serverless containers
let memoryScenarios = [];

export default async function handler(req, res) {
  const dbPath = path.join(process.cwd(), 'scenarios.json');

  const getScenarios = () => {
    try {
      if (fs.existsSync(dbPath)) {
        const data = fs.readFileSync(dbPath, 'utf-8');
        const fileList = JSON.parse(data || '[]');
        
        // Merge file list and memory scenarios to sync
        const merged = [...fileList, ...memoryScenarios];
        
        // Unique by id (deduplicate)
        const seen = new Set();
        const unique = [];
        for (const item of merged) {
          if (item && item.id && !seen.has(item.id)) {
            seen.add(item.id);
            unique.push(item);
          }
        }
        // Sort by ID (timestamp desc)
        return unique.sort((a, b) => b.id.localeCompare(a.id));
      }
    } catch (e) {
      console.warn("Read scenarios.json failed (normal in clean serverless states):", e.message);
    }
    return memoryScenarios.sort((a, b) => b.id.localeCompare(a.id));
  };

  const saveScenarios = (list) => {
    memoryScenarios = list;
    try {
      fs.writeFileSync(dbPath, JSON.stringify(list, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.warn("Write scenarios.json failed (normal on Vercel Serverless):", e.message);
      return false; 
    }
  };

  if (req.method === 'GET') {
    return res.status(200).json(getScenarios());
  }

  if (req.method === 'POST') {
    const { action, scenario, id, list } = req.body;
    let current = getScenarios();

    if (action === 'save' && scenario) {
      const exists = current.some(s => s.scenarioText.trim() === scenario.scenarioText.trim() && JSON.stringify(s.result.summary) === JSON.stringify(scenario.result.summary));
      if (!exists) {
        current = [scenario, ...current];
      }
    } else if (action === 'delete' && id) {
      current = current.filter(s => s.id !== id);
    } else if (action === 'set' && Array.isArray(list)) {
      current = list;
    }

    saveScenarios(current);
    return res.status(200).json(current);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
