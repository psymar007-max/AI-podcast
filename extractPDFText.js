const fs = require('fs');
const pdf = require('pdf-parse');

// 读取PDF文件并提取文本
async function extractPDFText(pdfPath) {
  try {
    // 读取文件为Buffer
    const dataBuffer = fs.readFileSync(pdfPath);
    
    // 解析PDF
    const data = await pdf(dataBuffer);
    
    // 将文本内容存储在字符串变量中
    const pdfText = data.text;
    
    // 输出PDF信息
    console.log('PDF版本: ' + data.version);
    console.log('页面数量: ' + data.numpages);
    console.log('文本内容长度: ' + pdfText.length + ' 字符');
    
    // 输出文本内容的前500个字符作为示例
    console.log('文本内容预览: ' + pdfText.substring(0, 500) + '...');
    
    // 返回文本内容
    return pdfText;
  } catch (error) {
    console.error('读取PDF文件时出错:', error);
    throw error;
  }
}

module.exports = extractPDFText;