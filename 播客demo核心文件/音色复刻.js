"use strict";

// 音色复刻 - Node.js 脚本
// 功能：
// 1) 通过 /v1/files/upload 上传本地音频文件，获取 file_id
// 2) 通过 /v1/voice_clone?GroupId=xxx 使用 file_id 调用快速复刻
// 运行示例：
//   MINIMAX_API_KEY=你的key GROUP_ID=你的GroupId node 音色复刻.js \
//     --file "/绝对路径/你的音频文件.wav" \
//     --voice-id "test1234"
// 或者：
//   node 音色复刻.js --api-key "你的key" --group-id "你的GroupId" \
//     --file "/绝对路径/你的音频文件.wav" --voice-id "test1234"
//
// 注意：请使用音频文件（如 .wav/.mp3/.m4a/.flac）。

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function assertNodeFetchAvailable() {
  if (typeof fetch !== "function" || typeof FormData === "undefined" || typeof Blob === "undefined") {
    console.error("当前 Node 版本不支持全局 fetch/FormData/Blob。请使用 Node 18+ 运行此脚本。");
    process.exit(1);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function guessMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".wav":
      return "audio/wav";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".flac":
      return "audio/flac";
    case ".ogg":
      return "audio/ogg";
    default:
      return "application/octet-stream";
  }
}

async function uploadFileForVoiceClone(apiKey, filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const absolutePath = path.resolve(filePath);
  const fileBuffer = fs.readFileSync(absolutePath);
  const mimeType = guessMimeType(absolutePath);
  const filename = path.basename(absolutePath);

  const form = new FormData();
  form.append("purpose", "voice_clone");
  form.append("file", new Blob([fileBuffer], { type: mimeType }), filename);

  const url = "https://api.minimaxi.com/v1/files/upload";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      // fetch 会自动设置 multipart/form-data 的 boundary
    },
    body: form,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`上传文件失败(${res.status}): ${text}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`解析上传响应失败: ${text}`);
  }

  // 兼容不同响应结构
  const fileId = data?.file?.file_id || data?.data?.id || data?.id || data?.file_id || data?.data?.file_id;
  if (!fileId) {
    throw new Error(`未从响应中解析到 file_id，响应: ${text}`);
  }

  return { fileId, raw: data };
}

async function quickVoiceClone(apiKey, groupId, voiceId, fileId, options = {}) {
  const url = `https://api.minimaxi.com/v1/voice_clone?GroupId=${encodeURIComponent(groupId)}`;
  const payload = {
    file_id: fileId,
    voice_id: voiceId,
  };

  if (options.demoText) {
    payload.demo_text = options.demoText;
  }
  if (options.needDemoAudio) {
    payload.need_demo_audio = true;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`快速复刻失败(${res.status}): ${text}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`解析快速复刻响应失败: ${text}`);
  }

  return data;
}

async function downloadIfDemoAudio(urlString, outputBasename) {
  if (!urlString || typeof urlString !== "string" || !/^https?:\/\//i.test(urlString)) {
    return null;
  }
  const res = await fetch(urlString);
  if (!res.ok) {
    throw new Error(`下载 demo_audio 失败(${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ext = (new URL(urlString).pathname.split(".").pop() || "mp3").split("?")[0];
  const output = path.resolve(`${outputBasename}.${ext}`);
  fs.writeFileSync(output, buffer);
  return output;
}

async function main() {
  assertNodeFetchAvailable();

  const args = parseArgs(process.argv);
  const apiKey = args["api-key"] || process.env.MINIMAX_API_KEY;
  const groupId = args["group-id"] || process.env.GROUP_ID;
  const filePath = args["file"] || args["f"];
  const voiceId = args["voice-id"] || `voice_${Date.now()}`;
  const needDemoAudio = Boolean(args["need-demo"]) || String(args["need-demo"]).toLowerCase() === "true";
  const demoText = args["demo-text"] || "这是一个音色复刻预览音频。";

  if (!apiKey || !groupId || !filePath) {
    console.error("用法: MINIMAX_API_KEY=你的key GROUP_ID=你的GroupId node 音色复刻.js --file /绝对路径/音频文件.wav --voice-id test1234 [--need-demo] [--demo-text 预览文本]");
    console.error("或:   node 音色复刻.js --api-key 你的key --group-id 你的GroupId --file /绝对路径/音频文件.wav --voice-id test1234 --need-demo --demo-text '你好，欢迎体验' ");
    process.exit(1);
  }

  try {
    console.log("[1/2] 正在上传文件以获取 file_id...");
    const { fileId } = await uploadFileForVoiceClone(apiKey, filePath);
    console.log(`上传成功，file_id = ${fileId}`);

    console.log("[2/2] 正在调用快速复刻接口...");
    const cloneResult = await quickVoiceClone(apiKey, groupId, voiceId, fileId, {
      needDemoAudio,
      demoText,
    });
    console.log("快速复刻响应:");
    console.log(JSON.stringify(cloneResult, null, 2));

    if (cloneResult?.demo_audio) {
      try {
        const saved = await downloadIfDemoAudio(cloneResult.demo_audio, `voice_clone_demo_${voiceId}`);
        if (saved) {
          console.log(`已保存 demo 音频到本地: ${saved}`);
          if (process.platform === "darwin") {
            try {
              spawn("open", [saved], { stdio: "ignore", detached: true });
            } catch {}
          }
        }
      } catch (e) {
        console.error(`demo 音频下载失败: ${e.message}`);
      }
    } else {
      console.log("未返回 demo_audio 链接。如果需要预览，请使用 --need-demo 并可配合 --demo-text 传入预览文本。");
    }
  } catch (err) {
    console.error("执行失败:", err?.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  uploadFileForVoiceClone,
  quickVoiceClone,
};
