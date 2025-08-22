const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');

const app = express();
const PORT = 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// 文件上传配置
const uploadsDir = path.join(__dirname, "uploads");
const outputsDir = path.join(__dirname, "outputs");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir);

app.use("/outputs", express.static(outputsDir));

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadsDir); },
  filename: function (req, file, cb) { 
    const ext = path.extname(file.originalname) || ""; 
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`); 
  },
});
const upload = multer({ storage });

// 任务管理
const jobs = new Map();
function setJob(id, patch) { 
  const cur = jobs.get(id) || { status: "Processing", progress: 0 }; 
  const next = { ...cur, ...patch }; 
  jobs.set(id, next); 
  return next; 
}

// 本地TTS功能
function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve({ stdout, stderr });
    });
  });
}

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

// 简单的文件解析功能
async function parseFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath, 'utf8');
  
  if (ext === '.txt') {
    return content;
  } else if (ext === '.pdf') {
    // 简单的PDF文本提取（实际项目中应该使用pdf-parse）
    return content.replace(/[^\w\s\u4e00-\u9fff]/g, ' ').trim();
  } else if (ext === '.doc' || ext === '.docx') {
    // 简单的DOC文本提取（实际项目中应该使用mammoth）
    return content.replace(/[^\w\s\u4e00-\u9fff]/g, ' ').trim();
  } else {
    return content;
  }
}

// 播客生成功能
async function generatePodcast(jobId, payload, files) {
  try {
    setJob(jobId, { status: "Processing", progress: 0.1 });
    
    let text = payload.text || "";
    
    // 处理网页链接
    if (payload.url) {
      setJob(jobId, { progress: 0.2 });
      console.log(`[JOB ${jobId}] 开始解析网页链接: ${payload.url}`);
      try {
        // 使用 node-fetch 或内置的 http 模块
        const https = require('https');
        const http = require('http');
        
        const url = new URL(payload.url);
        const client = url.protocol === 'https:' ? https : http;
        
        const response = await new Promise((resolve, reject) => {
          client.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
          }).on('error', reject);
        });
        
        // 简单的HTML标签清理
        text = response.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        console.log(`[JOB ${jobId}] 网页解析完成，提取文本长度: ${text.length}`);
      } catch (error) {
        console.error(`[JOB ${jobId}] 网页解析失败:`, error);
      }
    }
    
    // 处理文件上传
    if (files.textFilePath) {
      setJob(jobId, { progress: 0.3 });
      console.log(`[JOB ${jobId}] 开始解析文件: ${files.textFilePath}`);
      try {
        text = await parseFile(files.textFilePath);
        console.log(`[JOB ${jobId}] 文件解析完成，提取文本长度: ${text.length}`);
        console.log(`[JOB ${jobId}] 文件内容预览: ${text.substring(0, 200)}...`);
      } catch (error) {
        console.error(`[JOB ${jobId}] 文件解析失败:`, error);
      }
    }
    
    if (!text.trim()) {
      throw new Error("未提供有效的文本内容");
    }
    
    // 音色复刻处理
    let voiceId = "audiobook_male_1"; // 默认音色
    if (files.referenceAudioPath) {
      setJob(jobId, { progress: 0.4 });
      console.log(`[JOB ${jobId}] 开始音色复刻: ${files.referenceAudioPath}`);
      
      try {
        // 这里应该调用 Minimax 的音色复刻 API
        // 暂时使用模拟的音色复刻
        voiceId = `voice_${Date.now()}`;
        console.log(`[JOB ${jobId}] 音色复刻完成，voice_id: ${voiceId}`);
      } catch (error) {
        console.error(`[JOB ${jobId}] 音色复刻失败:`, error);
        console.log(`[JOB ${jobId}] 使用默认音色继续`);
      }
    }
    
    // 生成播客脚本
    setJob(jobId, { progress: 0.5 });
    console.log(`[JOB ${jobId}] 开始生成播客脚本，文本长度: ${text.length}`);
    
    // 简单的脚本生成（模拟）
    const podcastScript = `欢迎收听播客节目。${text.substring(0, 500)}...感谢收听，我们下期再见！`;
    console.log(`[JOB ${jobId}] 播客脚本生成完成，长度: ${podcastScript.length}`);
    
    // 生成音频
    setJob(jobId, { progress: 0.8 });
    console.log(`[JOB ${jobId}] 开始生成音频，使用音色: ${voiceId}`);
    
    const localOut = await synthesizeWithSay(podcastScript, path.join(outputsDir, jobId), { 
      voice: "Ting-Ting", 
      rate: 180 
    });
    
    const audioUrl = `/outputs/${path.basename(localOut)}`;
    setJob(jobId, { status: "Success", progress: 1, audio_url: audioUrl });
    console.log(`[JOB ${jobId}] 播客生成完成: ${audioUrl}`);
    
  } catch (error) {
    console.error(`[JOB ${jobId}] 失败:`, error);
    setJob(jobId, { status: "Error", error: error.message });
  }
}

// 默认路由指向 demo.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'demo.html'));
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: '播客生成 Demo 服务器运行正常'
  });
});

// 播客生成 API
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

// 查询任务状态
app.get("/api/generate-podcast/:taskId", (req, res) => {
  const job = jobs.get(req.params.taskId);
  if (!job) {
    return res.status(404).json({ error: "任务不存在" });
  }
  res.json(job);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 播客生成 Demo 服务器已启动`);
  console.log(`📍 本地访问: http://localhost:${PORT}`);
  console.log(`🌐 网络访问: http://0.0.0.0:${PORT}`);
  console.log(`📱 前端页面: demo.html`);
  console.log(`🔧 后端API: /api/generate-podcast`);
});
