# 播客生成 Demo 核心文件

## 文件说明

### 1. demo.html
前端界面文件，包含完整的用户交互界面：
- 文本输入框
- 文件上传功能
- 参考音频上传
- 生成按钮和进度显示
- 音频播放器和下载功能

### 2. 音色复刻.js
Minimax 音色复刻功能模块：
- `uploadFileForVoiceClone()` - 上传音频文件获取 file_id
- `quickVoiceClone()` - 快速音色复刻
- 支持 CLI 直接调用测试

### 3. gen_voice.js
Minimax 长文本语音合成功能模块：
- `createT2ATask()` - 创建语音合成任务
- `queryT2ATask()` - 查询任务状态
- `retrieveFile()` - 下载生成的音频文件
- 支持 CLI 直接调用测试

## 使用方法

### 环境要求
- Node.js 18+
- Minimax API Key 和 Group ID

### 集成步骤
1. 将这三个文件复制到你的项目中
2. 在你的后端代码中引入这些模块：
   ```javascript
   const { uploadFileForVoiceClone, quickVoiceClone } = require('./音色复刻.js');
   const { createT2ATask, queryT2ATask, retrieveFile } = require('./gen_voice.js');
   ```
3. 设置环境变量：
   ```bash
   export MINIMAX_API_KEY="你的API密钥"
   export GROUP_ID="你的Group ID"
   ```

### API 调用流程
1. **音色复刻**（可选）：
   ```javascript
   const { fileId } = await uploadFileForVoiceClone(apiKey, audioFilePath);
   const voiceId = `voice_${Date.now()}`;
   await quickVoiceClone(apiKey, groupId, voiceId, fileId);
   ```

2. **语音合成**：
   ```javascript
   const { taskId } = await createT2ATask(apiKey, groupId, {
     model: "speech-2.5-hd-preview",
     text: "要合成的文本",
     voice_setting: { voice_id: voiceId || "audiobook_male_1" }
   });
   
   // 轮询任务状态
   const result = await queryT2ATask(apiKey, groupId, taskId);
   
   // 下载音频
   const audioBuffer = await retrieveFile(apiKey, result.file_id);
   ```

### 前端集成
- 将 `demo.html` 部署到你的前端服务器
- 修改其中的 API 地址指向你的后端服务
- 确保 CORS 配置正确

## 注意事项
- 这些模块依赖 Minimax API，需要有效的 API Key
- 音色复刻功能需要上传的音频文件质量较好
- 长文本合成可能需要较长时间，建议实现轮询机制
- 建议实现错误处理和重试机制

## 测试
每个模块都支持 CLI 直接调用进行测试，详见各文件中的注释。
