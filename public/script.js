// 图标存储和状态管理
let iconStore = { images: {}, names: [], ids: [] };
let observer = null;
let isLoading = false;

// 主初始化函数
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  try {
    showLoading(true);
    await loadIcons();
    setupEventListeners();
  } catch (error) {
    showError(`初始化失败: ${error.message}`);
  } finally {
    showLoading(false);
  }
}

// 核心功能函数
async function loadIcons() {
  if (isLoading) return;
  
  try {
    isLoading = true;
    const response = await fetch('/api/icons');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    validateIconData(data);
    
    iconStore = data;
    renderIcons();
    updateSelectionCount();
  } catch (error) {
    console.error('图标加载失败:', error);
    throw error;
  } finally {
    isLoading = false;
  }
}

function renderIcons() {
  const container = document.getElementById('iconContainer');
  if (!container) {
    throw new Error('找不到图标容器元素');
  }

  container.innerHTML = iconStore.ids.map((id, index) => `
    <div class="icon-card" data-id="${id}">
      <div class="checkbox-container">
        <input 
          type="checkbox" 
          id="icon-${id}" 
          class="icon-checkbox" 
          onchange="handleCheckboxChange(event)"
        >
      </div>
      <div class="icon-preview">
        <object 
          type="image/svg+xml" 
          data="${iconStore.images[id]}"
          onload="handleSVGLoad(event)"
          onerror="handleSVGError(event)"
        ></object>
      </div>
      <div class="icon-name">${iconStore.names[index]}</div>
    </div>
  `).join('');

  // 延迟初始化确保DOM就绪
  setTimeout(initSVGInteractions, 50);
}

// SVG交互系统
function initSVGInteractions() {
  setupMutationObserver();
  attachSVGEventHandlers();
}

function handleSVGLoad(event) {
  const obj = event.target;
  try {
    const svgDoc = obj.contentDocument;
    if (!svgDoc) return;

    // 清理Figma元数据
    svgDoc.querySelectorAll('title, desc').forEach(el => el.remove());
    
    // 添加交互样式
    svgDoc.documentElement.classList.add('interactive-svg');
    svgDoc.documentElement.style.cursor = 'pointer';
    
    // 事件委托
    svgDoc.addEventListener('click', handleSVGClick);
  } catch (error) {
    console.error('SVG加载处理失败:', error);
  } finally {
    obj.style.opacity = 1;
  }
}

function handleSVGError(event) {
  console.error('SVG加载失败:', event.target.data);
  event.target.parentElement.classList.add('error');
}

function handleSVGClick(event) {
  const obj = event.currentTarget.ownerDocument.defaultView.frameElement;
  const card = obj.closest('.icon-card');
  if (!card) return;

  const checkbox = card.querySelector('.icon-checkbox');
  if (checkbox) {
    checkbox.checked = !checkbox.checked;
    updateSelectionCount();
  }
}

// 选择管理
function handleCheckboxChange(event) {
  updateSelectionCount();
  event.stopPropagation();
}

function updateSelectionCount() {
  const count = document.querySelectorAll('.icon-checkbox:checked').length;
  const counter = document.getElementById('selectedCount');
  if (counter) {
    counter.textContent = count;
    counter.style.color = count > 0 ? '#2563eb' : 'inherit';
  }
}

// 下载系统
async function downloadSelected() {
  const selected = getSelectedIcons();
  if (selected.length === 0) {
    return showError('请选择至少一个图标');
  }

  try {
    showLoading(true, '打包下载中...');
    const zip = await createIconZip(selected);
    saveAs(zip, `icons_${Date.now()}.zip`);
  } catch (error) {
    showError(`下载失败: ${error.message}`);
  } finally {
    showLoading(false);
  }
}

async function createIconZip(selected) {
  const zip = new JSZip();
  let successCount = 0;

  await Promise.all(selected.map(async ({ id, name }) => {
    try {
      const svgText = await fetchSVGContent(id);
      zip.file(`${sanitizeFileName(name)}.svg`, svgText);
      successCount++;
    } catch (error) {
      console.error(`[${name}] 下载失败:`, error);
    }
  }));

  if (successCount === 0) {
    throw new Error('所有图标下载失败');
  }

  return zip.generateAsync({ type: 'blob' });
}

async function fetchSVGContent(id) {
  const response = await fetch(iconStore.images[id]);
  if (!response.ok) throw new Error('网络请求失败');
  
  const text = await response.text();
  if (!text.startsWith('<svg')) throw new Error('无效的SVG内容');
  
  return optimizeSVG(text);
}

// 工具函数
function setupMutationObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    mutations.forEach(() => attachSVGEventHandlers());
  });

  observer.observe(document.getElementById('iconContainer'), {
    childList: true,
    subtree: true
  });
}

function attachSVGEventHandlers() {
  document.querySelectorAll('.icon-preview object').forEach(obj => {
    if (!obj.onload) {
      obj.onload = handleSVGLoad;
    }
  });
}

function validateIconData(data) {
  if (!data || !data.images || !data.names || !data.ids) {
    throw new Error('无效的图标数据格式');
  }
}

function optimizeSVG(svgText) {
  return svgText
    .replace(/<\?xml.*?\?>/g, '')
    .replace(/<!--(.*?)-->/gs, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
}

function getSelectedIcons() {
  return Array.from(document.querySelectorAll('.icon-checkbox:checked'))
    .map(checkbox => {
      const id = checkbox.id.replace('icon-', '');
      const index = iconStore.ids.indexOf(id);
      return index !== -1 ? { id, name: iconStore.names[index] } : null;
    })
    .filter(Boolean);
}

// UI状态管理
function showLoading(show, message = '加载中...') {
  const loader = document.getElementById('loadingIndicator') || createLoader();
  loader.textContent = message;
  loader.style.display = show ? 'block' : 'none';
}

function createLoader() {
  const loader = document.createElement('div');
  loader.id = 'loadingIndicator';
  // loader.style = /* 添加加载样式 */;
  document.body.appendChild(loader);
  return loader;
}

function showError(message) {
  const errorBox = document.getElementById('errorMessage') || createErrorBox();
  errorBox.textContent = message;
  setTimeout(() => errorBox.remove(), 5000);
}

function createErrorBox() {
  const box = document.createElement('div');
  box.id = 'errorMessage';
  // box.style = /* 添加错误提示样式 */;
  document.body.appendChild(box);
  return box;
}

// 事件绑定
function setupEventListeners() {
  const refreshBtn = document.querySelector('button[onclick="refreshIcons()"]');
  const downloadBtn = document.querySelector('button[onclick="downloadSelected()"]');
  
  refreshBtn?.addEventListener('click', handleRefresh);
  downloadBtn?.addEventListener('click', handleDownload);
}

function handleRefresh(event) {
  event.preventDefault();
  refreshIcons();
}

function handleDownload(event) {
  event.preventDefault();
  downloadSelected();
}

async function refreshIcons() {
  try {
    showLoading(true, '刷新图标中...');
    await loadIcons();
  } catch (error) {
    showError(`刷新失败: ${error.message}`);
  } finally {
    showLoading(false);
  }
}

// 防抖处理窗口变化
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(initSVGInteractions, 200);
});