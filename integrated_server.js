"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { exec } = require("child_process");
const os = require("os");

// 导入你的核心模块
const { uploadFileForVoiceClone, quickVoiceClone } = require("./播客demo核心文件/音色复刻");
const { createT2ATask, queryT2ATask, retrieveFile } = require("./播客demo核心文件/gen_voice");

// 导入队友的服务
const extractPDFText = require("./extractPDFText");
const { callDoubaoWithInstructionAndDoc } = require("./text_to_draft_doubao");

const app = express();
const PORT = process.env.PORT || 3000;

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";
const GROUP_ID = process.env.GROUP_ID || "1956929272627073130";

const uploadsDir = path.join(__dirname, "uploads");
const outputsDir = path.join(__dirname, "outputs");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir);

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/outputs", express.static(outputsDir));

// 健康检查端点
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    services: {
      minimax: !!MINIMAX_API_KEY,
      ffmpeg: true,
      node: process.version
    }
  });
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadsDir); },
  filename: function (req, file, cb) { const ext = path.extname(file.originalname) || ""; cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`); },
});
const upload = multer({ storage });

const jobs = new Map();
function setJob(id, patch) { const cur = jobs.get(id) || { status: "Processing", progress: 0 }; const next = { ...cur, ...patch }; jobs.set(id, next); return next; }

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve({ stdout, stderr });
    });
  });
}

// 本地TTS兜底功能
async function synthesizeWithSay(text, baseOutputPath, options = {}) {
  const voice = options.voice || "Ting-Ting";
  const rate = Number(options.rate || 180);
  const tmpTxt = path.join(os.tmpdir(), `say_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`);
  const tmpAiff = `${baseOutputPath}.aiff`;
  const outM4a = `${baseOutputPath}.m4a`;
  fs.writeFileSync(tmpTxt, text, "utf8");
  await execPromise(`say -v "${voice}" -r ${rate} -f "${tmpTxt}" -o "${tmpAiff}"`);
  try {
    await execPromise(`afconvert -f m4af -d aac "${tmpAiff}" "${outM4a}"`);
    try { fs.unlinkSync(tmpAiff); } catch {}
    try { fs.unlinkSync(tmpTxt); } catch {}
    return outM4a;
  } catch (_) {
    try {
      const mp3Out = `${baseOutputPath}.mp3`;
      await execPromise(`ffmpeg -y -i "${tmpAiff}" -codec:a libmp3lame -qscale:a 2 "${mp3Out}"`);
      try { fs.unlinkSync(tmpAiff); } catch {}
      try { fs.unlinkSync(tmpTxt); } catch {}
      return mp3Out;
    } catch (e2) {
      console.warn("[Fallback] afconvert/ffmpeg 不可用，返回 AIFF 原始文件。", e2.message);
      try { fs.unlinkSync(tmpTxt); } catch {}
      return tmpAiff;
    }
  }
}

// 整合的播客生成流程
async function generatePodcast(jobId, payload, files) {
  try {
    setJob(jobId, { status: "Processing", progress: 0.05 });

    let extractedText = "";
    let podcastScript = "";

    // 步骤1: 解析上传的文件
    if (files.textFilePath) {
      setJob(jobId, { progress: 0.1 });
      console.log(`[JOB ${jobId}] 开始解析文件: ${files.textFilePath}`);
      
      try {
        // 集成队友的PDF解析服务
        if (path.extname(files.textFilePath).toLowerCase() === '.pdf') {
          console.log(`[JOB ${jobId}] 开始PDF解析`);
          extractedText = await extractPDFText(files.textFilePath);
        } else {
          extractedText = fs.readFileSync(files.textFilePath, 'utf8');
        }
        
        console.log(`[JOB ${jobId}] 文件解析完成，提取文本长度: ${extractedText.length}`);
      } catch (e) {
        console.warn(`[JOB ${jobId}] 文件解析失败: ${e?.message || e}`);
        if (payload.text) {
          extractedText = payload.text;
          console.log(`[JOB ${jobId}] 回退使用用户输入的文本`);
        } else {
          throw new Error(`文件解析失败：${e?.message || e}`);
        }
      }
      setJob(jobId, { progress: 0.25 });
    } else if (payload.text) {
      extractedText = payload.text;
      setJob(jobId, { progress: 0.25 });
    } else if (payload.url) {
      setJob(jobId, { progress: 0.1 });
      console.log(`[JOB ${jobId}] 开始解析网页链接: ${payload.url}`);
      
      try { 
        // 使用 fetch 获取网页内容
        const response = await fetch(payload.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const html = await response.text();
        
        // 简单的 HTML 文本提取（移除 HTML 标签）
        const textContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // 移除 script 标签
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // 移除 style 标签
          .replace(/<[^>]+>/g, '') // 移除所有 HTML 标签
          .replace(/&nbsp;/g, ' ') // 替换 HTML 实体
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ') // 合并多个空格
          .trim();
        
        extractedText = textContent;
        console.log(`[JOB ${jobId}] 网页解析完成，提取文本长度: ${extractedText.length}`);
      }
      catch (e) { 
        console.warn(`[JOB ${jobId}] URL 解析失败: ${e?.message || e}`); 
        throw new Error(`URL 解析失败：${e?.message || e}`);
      }
      setJob(jobId, { progress: 0.25 });
    } else {
      throw new Error("未提供文本内容、文件或网页链接");
    }

    // 步骤2: 使用大模型生成播客脚本
    setJob(jobId, { progress: 0.35 });
    console.log(`[JOB ${jobId}] 开始生成播客脚本`);
    
    try {
              // 集成队友的大模型服务
        console.log(`[JOB ${jobId}] 开始生成播客脚本，文本长度: ${extractedText.length}`);
        podcastScript = await callDoubaoWithInstructionAndDoc(undefined, extractedText);
        console.log(`[JOB ${jobId}] 播客脚本生成完成，长度: ${podcastScript.length}`);
    } catch (e) {
      console.warn(`[JOB ${jobId}] 播客脚本生成失败: ${e?.message || e}`);
      podcastScript = extractedText;
    }
    setJob(jobId, { progress: 0.5 });

    // 步骤3: 音色复刻
    let voiceId = "audiobook_male_1";
    let usedCustomVoice = false;
    
    if (files.referenceAudioPath) {
      if (!MINIMAX_API_KEY) throw new Error("未配置 MINIMAX_API_KEY，无法进行音色复刻");
      
      setJob(jobId, { progress: 0.6 });
      console.log(`[JOB ${jobId}] 开始音色复刻`);
      
      try {
        const { fileId } = await uploadFileForVoiceClone(MINIMAX_API_KEY, files.referenceAudioPath);
        voiceId = `voice_${Date.now()}`;
        await quickVoiceClone(MINIMAX_API_KEY, GROUP_ID, voiceId, fileId);
        usedCustomVoice = true;
        console.log(`[JOB ${jobId}] 音色复刻完成，voice_id: ${voiceId}`);
      } catch (e) {
        console.warn(`[JOB ${jobId}] 音色复刻失败: ${e?.message || e}`);
        voiceId = "audiobook_male_1";
      }
      setJob(jobId, { progress: 0.75 });
    }

    // 步骤4: 生成最终音频
    setJob(jobId, { progress: 0.8 });
    console.log(`[JOB ${jobId}] 开始生成音频`);
    
    if (!MINIMAX_API_KEY) throw new Error("未配置 MINIMAX_API_KEY，无法创建语音合成任务");

    const model = payload.model || "speech-2.5-hd-preview";
    const audioFormat = payload.format || "mp3";

    let minimaxTaskId = "";
    try {
      const createRes = await createT2ATask(MINIMAX_API_KEY, GROUP_ID, {
        model,
        text: podcastScript,
        language_boost: payload.language_boost || "auto",
        voice_setting: { 
          voice_id: voiceId, 
          speed: Number(payload.speed || 1), 
          vol: Number(payload.vol || 1), 
          pitch: Number(payload.pitch || 1) 
        },
        audio_setting: { 
          audio_sample_rate: Number(payload['audio-sample-rate'] || 32000), 
          bitrate: Number(payload.bitrate || 128000), 
          format: audioFormat, 
          channel: Number(payload.channel || 2) 
        },
      });
      minimaxTaskId = createRes.taskId;
    } catch (e) {
      const msg = String(e?.message || e);
      if (usedCustomVoice && (/voice id wrong/i.test(msg) || /2013/.test(msg))) {
        console.warn(`[JOB ${jobId}] 自定义音色不可用，已回退内置音色。`);
        const createRes2 = await createT2ATask(MINIMAX_API_KEY, GROUP_ID, {
          model,
          text: podcastScript,
          language_boost: payload.language_boost || "auto",
          voice_setting: { voice_id: "audiobook_male_1", speed: Number(payload.speed || 1), vol: Number(payload.vol || 1), pitch: Number(payload.pitch || 1) },
          audio_setting: { audio_sample_rate: Number(payload['audio-sample-rate'] || 32000), bitrate: Number(payload.bitrate || 128000), format: audioFormat, channel: Number(payload.channel || 2) },
        });
        minimaxTaskId = createRes2.taskId;
      } else if (/insufficient balance/i.test(msg) || /1008/.test(msg)) {
        console.warn(`[JOB ${jobId}] 余额不足，使用本地 TTS 兜底生成。`);
        const localOut = await synthesizeWithSay(podcastScript, path.join(outputsDir, jobId), { voice: "Ting-Ting", rate: 180 });
        const audioUrl = `/outputs/${path.basename(localOut)}`;
        setJob(jobId, { status: "Success", progress: 1, audio_url: audioUrl });
        return; // 已完成
      } else {
        throw e;
      }
    }

    // 轮询任务状态
    setJob(jobId, { progress: 0.85 });
    let result;
    while (true) {
      result = await queryT2ATask(MINIMAX_API_KEY, GROUP_ID, minimaxTaskId);
      if (result.status === "Success") break;
      if (result.status === "Failed") throw new Error(`任务失败: ${result.error || "未知错误"}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 下载音频文件
    setJob(jobId, { progress: 0.95 });
    const audioBuffer = await retrieveFile(MINIMAX_API_KEY, result.file_id);
    const outputPath = path.join(outputsDir, `${jobId}.${audioFormat}`);
    fs.writeFileSync(outputPath, audioBuffer);
    const audioUrl = `/outputs/${path.basename(outputPath)}`;

    setJob(jobId, { status: "Success", progress: 1, audio_url: audioUrl });
    console.log(`[JOB ${jobId}] 播客生成完成: ${audioUrl}`);

  } catch (error) {
    console.error(`[JOB ${jobId}] 失败:`, error);
    setJob(jobId, { status: "Error", error: error.message });
  }
}

// API 路由
app.post("/api/generate-podcast", upload.fields([
  { name: "text_file", maxCount: 1 },
  { name: "reference_audio", maxCount: 1 }
]), async (req, res) => {
  try {
    const jobId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const files = {};
    
    if (req.files.text_file) {
      files.textFilePath = req.files.text_file[0].path;
    }
    if (req.files.reference_audio) {
      files.referenceAudioPath = req.files.reference_audio[0].path;
    }

    const payload = {
      text: req.body.text,
      url: req.body.url,
      model: req.body.model,
      format: req.body.format,
      speed: req.body.speed,
      vol: req.body.vol,
      pitch: req.body.pitch,
      'audio-sample-rate': req.body['audio-sample-rate'],
      bitrate: req.body.bitrate,
      channel: req.body.channel,
      language_boost: req.body.language_boost
    };

    // 异步处理任务
    generatePodcast(jobId, payload, files);

    res.json({ task_id: jobId });
  } catch (error) {
    console.error("创建任务失败:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/generate-podcast/:taskId", (req, res) => {
  const job = jobs.get(req.params.taskId);
  if (!job) {
    return res.status(404).json({ error: "任务不存在" });
  }
  res.json(job);
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log("整合服务器已启动，等待集成队友的服务...");
});
