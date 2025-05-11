require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();

// 中间件配置
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Figma配置
const FIGMA_API = 'https://api.figma.com/v1';
const config = {
  headers: { 
    'X-Figma-Token': process.env.FIGMA_TOKEN,
    'Accept-Encoding': 'gzip,deflate,compress'
  }
};

// 请求日志中间件
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: Date.now() });
});

// 图标数据端点
app.get('/api/icons', async (req, res) => {
  try {
    // 环境变量验证
    const requiredVars = ['FIGMA_TOKEN', 'FIGMA_FILE_ID', 'GROUP_NODE_ID'];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
      throw new Error(`缺少环境变量: ${missingVars.join(', ')}`);
    }

    // 获取节点数据
    const nodesUrl = `${FIGMA_API}/files/${process.env.FIGMA_FILE_ID}/nodes?ids=${process.env.GROUP_NODE_ID}`;
    const nodesRes = await axios.get(nodesUrl, config);
    
    // 节点结构验证
    let targetNode = nodesRes.data?.nodes?.[process.env.GROUP_NODE_ID];
    if (!targetNode?.document) {
      throw new Error('无效的Figma节点结构');
    }
    targetNode = targetNode.document.children.filter((node) => node.type === 'COMPONENT_SET')[0]

    // 过滤有效子节点
    const validTypes = ['VECTOR', 'COMPONENT', 'BOOLEAN_OPERATION'];
    const vectorNodes = targetNode.children.filter(node => 
      validTypes.includes(node.type) && node.name
    );

    if (vectorNodes.length === 0) {
      throw new Error('分组中没有找到有效图标');
    }

    // 获取导出URL
    const exportUrl = `${FIGMA_API}/images/${process.env.FIGMA_FILE_ID}?ids=${vectorNodes.map(n => n.id)}&format=svg`;
    const exportRes = await axios.get(exportUrl, config);

    res.json({
      images: exportRes.data.images,
      names: vectorNodes.map(n => n.name),
      ids: vectorNodes.map(n => n.id)
    });

  } catch (error) {
    console.error('[SERVER ERROR]', error);
    res.status(500).json({
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 服务已启动: http://localhost:${PORT}`);
  console.log('✅ 验证环境变量:');
  console.log(`   - Figma文件ID: ${process.env.FIGMA_FILE_ID ? '已配置' : '缺失'}`);
  console.log(`   - 分组节点ID: ${process.env.GROUP_NODE_ID ? '已配置' : '缺失'}`);
});