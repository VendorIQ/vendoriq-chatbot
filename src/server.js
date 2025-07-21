require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const cors = require('cors');

// ====== CONFIGURATION ======
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bucket = 'uploads';

const app = express();
app.use(cors());
app.use(express.json());

// ====== HELPERS ======
async function listAllFiles(bucket, folderPath = '') {
  const { data, error } = await supabase.storage.from(bucket).list(folderPath, { limit: 100 });
  if (error) throw error;
  let files = [];
  if (!data) return files;
  for (const item of data) {
    if (!item.id) {
      // It's a folder
      const subfolderFiles = await listAllFiles(bucket, (folderPath ? folderPath + '/' : '') + item.name);
      files = files.concat(subfolderFiles);
    } else {
      // It's a file
      files.push((folderPath ? folderPath + '/' : '') + item.name);
    }
  }
  return files;
}

async function downloadFile(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error) throw error;
  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(localPath, buffer);
  return localPath;
}

async function extractText(localPath) {
  const ext = localPath.split('.').pop().toLowerCase();
  if (ext === 'pdf') {
    const data = await pdfParse(fs.readFileSync(localPath));
    return data.text;
  } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
    const { data: { text } } = await Tesseract.recognize(localPath, 'eng');
    return text;
  } else {
    return '';
  }
}

// Improved score extractor: looks for Score: XX/100 or Score: XX
function extractScore(text) {
  // Try Score: 85/100 or Score: 85
  const match = text.match(/score\s*[:=]?\s*(\d{1,3})(?:\s*\/\s*100)?/i);
  return match ? parseInt(match[1], 10) : null;
}

// ====== API ENDPOINT ======
app.post('/api/run-gemini-feedback', async (req, res) => {
  const { email, sessionId } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }
  const userFolder = `uploads/${sessionId ? sessionId + '_' : ''}${email}`;
  try {
    const files = await listAllFiles(bucket, userFolder);
    if (!files.length) {
      return res.status(404).json({ error: 'No files found for this user or wrong folder path.' });
    }
    let combinedText = '';
    let tempFiles = [];
    for (let storagePath of files) {
      try {
        const filename = path.basename(storagePath);
        const localPath = path.join('/tmp', filename);
        await downloadFile(storagePath, localPath);
        tempFiles.push(localPath);
        const text = await extractText(localPath);
        combinedText += `\n=== Content from ${filename} ===\n${text}\n`;
      } catch (err) {
        console.error(`Error processing ${storagePath}:`, err.message);
      }
    }
    if (!combinedText.trim()) {
      return res.status(422).json({ error: "No readable content found in any files." });
    }

    // --- Improved prompt for Gemini! ---
    const prompt = `
You are an OHS compliance expert with auditor experience.
Review the supplied compliance files and provide feedback in this format (use Markdown formatting for lists):

Summary:
<Short summary>

Suggestions:
- Bullet-point actionable suggestions

Score: X/100

Return only the above. End strictly with 'Score: X/100' (where X is a number from 1-100).

FILES:
${combinedText}

---
Feedback:
`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const feedback = response.text();

    // Extract the score
    const score = extractScore(feedback);

    // Save Gemini feedback to Supabase
    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        gemini_summary: feedback,
        gemini_score: score
      })
      .eq('email', email);

    // Clean up temp files
    for (let f of tempFiles) {
      try { fs.unlinkSync(f); } catch {}
    }

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }
    res.json({ success: true, feedback, score });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ====== START SERVER ======
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`VendorIQ Gemini API listening on port ${PORT}`);
});
