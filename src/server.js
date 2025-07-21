require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// === CONFIGURATION ===
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bucket = 'uploads';
const userFolder = 'uploads/9224bfd1-840a-4359-ac29-86e23ecdbab7_pilot@nexwave.net'; // <--- Change as needed

// Recursively list all files for a user (across all questions/subfolders)
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

// Download a file from Supabase to a local temp path
async function downloadFile(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error) throw error;
  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(localPath, buffer);
  return localPath;
}

// Extract text from PDF or image file
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

// MAIN FUNCTION
async function main() {
  // 1. Get all files for this user
  const files = await listAllFiles(bucket, userFolder);
  if (!files.length) {
    console.log('No files found for this user or wrong folder path.');
    return;
  }

  let combinedText = '';
  let tempFiles = [];

  // 2. Download and extract text
  for (let storagePath of files) {
    try {
      const filename = path.basename(storagePath);
      const localPath = path.join('/tmp', filename); // Use './' if you want local folder
      await downloadFile(storagePath, localPath);
      tempFiles.push(localPath);
      const text = await extractText(localPath);
      combinedText += `\n=== Content from ${filename} ===\n${text}\n`;
    } catch (err) {
      console.error(`Error processing ${storagePath}:`, err.message);
    }
  }
  if (!combinedText.trim()) {
    console.log("No readable content found in any files.");
    return;
  }

  // 3. Get Gemini AI feedback
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = `You are an OHS compliance expert with Auditor knowledge. Review all these compliance files and provide a single summary and actionable suggestions, and generate an objective score from 1 to 100%:\n\n${combinedText}\n\n---\nFeedback:`;
  const result = await model.generateContent(prompt);
  const response = await result.response;
  console.log("\n\nGemini Summary & Suggestions:\n", response.text());

  // 4. Clean up temp files
  for (let f of tempFiles) {
    try { fs.unlinkSync(f); } catch {}
  }
}

main().catch(e => console.error(e));
