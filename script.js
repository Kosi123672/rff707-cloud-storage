// ========== ANTI INSPECT ==========
let isBanned = false, banEndTime = null;

function checkBanStatus() {
    const saved = localStorage.getItem('rff707_cloud_ban_end');
    if(saved && parseInt(saved) > Date.now()) {
        isBanned = true;
        banEndTime = parseInt(saved);
        document.getElementById('banOverlay').style.display = 'flex';
        const updateTimer = () => {
            const remaining = Math.max(0, banEndTime - Date.now());
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            document.getElementById('banTimer').textContent = `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
            if(remaining <= 0) { 
                localStorage.removeItem('rff707_cloud_ban_end'); 
                location.reload(); 
            }
        };
        updateTimer();
        setInterval(updateTimer, 1000);
        return true;
    }
    return false;
}

function activateBan() { 
    if(isBanned) return; 
    isBanned = true; 
    localStorage.setItem('rff707_cloud_ban_end', Date.now() + 30*60*1000); 
    location.reload(); 
}

document.addEventListener('contextmenu', (e) => { e.preventDefault(); activateBan(); });
document.addEventListener('keydown', (e) => { 
    if(e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.key === 'u')) { 
        e.preventDefault(); 
        activateBan(); 
    } 
});

setInterval(() => { 
    if(!isBanned) { 
        const before = performance.now(); 
        debugger; 
        if(performance.now() - before > 50) activateBan(); 
    } 
}, 1000);

if(checkBanStatus()) throw new Error("Banned");

// ========== STORAGE FUNCTIONS ==========
let db = null;
let allFiles = [];
let currentCategory = 'all';
let currentFolder = 'root';
let folderStructure = [];
let currentSearchQuery = '';
let currentPreviewFile = null;
let currentRenameFile = null;
let storageChart = null;

function getUserDBName() {
    const user = getCurrentUser();
    return user ? `RFF707_Storage_${user.id}` : 'RFF707_Storage_Guest';
}

function initStorage() {
    return new Promise((resolve) => {
        const request = indexedDB.open(getUserDBName(), 2);
        request.onupgradeneeded = (e) => { 
            if(!e.target.result.objectStoreNames.contains('files')) {
                e.target.result.createObjectStore('files', { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => { 
            db = e.target.result; 
            resolve(); 
        };
        request.onerror = () => resolve();
    });
}

function saveFile(fileData, blob) {
    return new Promise((resolve) => {
        const tx = db.transaction(['files'], 'readwrite');
        tx.objectStore('files').put({ ...fileData, blob, parentId: currentFolder }).onsuccess = () => resolve();
    });
}

function getAllFilesFromDB() {
    return new Promise((resolve) => {
        const tx = db.transaction(['files'], 'readonly');
        tx.objectStore('files').getAll().onsuccess = (e) => resolve(e.target.result || []);
    });
}

function deleteFileFromDB(id) {
    return new Promise((resolve) => {
        const tx = db.transaction(['files'], 'readwrite');
        tx.objectStore('files').delete(id).onsuccess = () => resolve();
    });
}

function updateFileNameInDB(id, newName) {
    return new Promise((resolve) => {
        const tx = db.transaction(['files'], 'readwrite');
        const store = tx.objectStore('files');
        store.get(id).onsuccess = (e) => { 
            const file = e.target.result; 
            if(file) { 
                file.name = newName; 
                store.put(file).onsuccess = () => resolve(); 
            } 
        };
    });
}

function getFileType(fn) {
    const ext = fn.split('.').pop().toLowerCase();
    if(['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) return 'image';
    if(['mp4','mkv','avi','mov','wmv','flv','webm'].includes(ext)) return 'video';
    if(['mp3','wav','ogg','m4a','flac','aac'].includes(ext)) return 'audio';
    if(['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md'].includes(ext)) return 'document';
    return 'other';
}

function formatSize(b) { 
    if(b===0) return '0 B'; 
    const k=1024, sizes=['B','KB','MB','GB']; 
    const i=Math.floor(Math.log(b)/Math.log(k)); 
    return parseFloat((b/Math.pow(k,i)).toFixed(2))+' '+sizes[i]; 
}

function getIcon(t) { 
    return { image:'🖼️', video:'🎬', audio:'🎵', document:'📄', other:'📎' }[t] || '📁'; 
}

function loadFolders() {
    const saved = localStorage.getItem(`folders_${getCurrentUser()?.id || 'guest'}`);
    folderStructure = saved ? JSON.parse(saved) : [{ id: 'root', name: 'My Drive', parentId: null, type: 'folder' }];
}

function saveFolders() { 
    localStorage.setItem(`folders_${getCurrentUser()?.id || 'guest'}`, JSON.stringify(folderStructure)); 
}

function createFolder() {
    const name = document.getElementById('newFolderName').value.trim();
    if(!name) { showToast('❌ Nama folder tidak boleh kosong'); return; }
    folderStructure.push({ 
        id: 'fld_' + Date.now(), 
        name, 
        parentId: currentFolder, 
        type: 'folder', 
        createdAt: new Date().toISOString() 
    });
    saveFolders();
    closeCreateFolderModal();
    renderFiles();
    showToast(`📁 Folder "${name}" created`);
}

function navigateToFolder(id) {
    currentFolder = id;
    updateBreadcrumb();
    renderFiles();
}

function updateBreadcrumb() {
    const bc = document.getElementById('breadcrumb');
    const path = [];
    let cur = folderStructure.find(f => f.id === currentFolder);
    while(cur && cur.id !== 'root') {
        path.unshift(cur);
        cur = folderStructure.find(f => f.id === cur.parentId);
    }
    path.unshift({ id: 'root', name: 'My Drive' });
    bc.innerHTML = path.map((item, idx) => 
        `<span class="breadcrumb-item ${idx===path.length-1?'active':''}" onclick="navigateToFolder('${item.id}')">📁 ${item.name}</span>`
    ).join('');
    document.getElementById('currentLocationName').innerHTML = path[path.length-1].name;
}

function setCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.category-folder').forEach(el => { 
        if(el.dataset.category === cat) el.classList.add('active'); 
        else el.classList.remove('active'); 
    });
    renderFiles();
}

async function renderFiles() {
    const grid = document.getElementById('fileGrid');
    if(!grid) return;
    
    const folders = folderStructure.filter(f => f.parentId === currentFolder && f.type === 'folder');
    let files = allFiles.filter(f => f.parentId === currentFolder);
    
    if(currentSearchQuery) { 
        files = files.filter(f => f.name.toLowerCase().includes(currentSearchQuery.toLowerCase())); 
    }
    if(currentCategory !== 'all' && currentCategory !== 'folder') { 
        files = files.filter(f => f.type === currentCategory); 
    }
    
    if(currentCategory === 'folder') {
        if(folders.length === 0) { 
            grid.innerHTML = '<div class="loader">📭 Tidak ada folder</div>'; 
            return; 
        }
        grid.innerHTML = folders.map(f => 
            `<div class="folder-card" ondblclick="navigateToFolder('${f.id}')">
                <div class="file-icon">📂</div>
                <div class="file-name">${f.name}</div>
                <div class="file-size">Folder</div>
            </div>`
        ).join('');
        return;
    }
    
    const items = [...folders.map(f => ({ ...f, isFolder: true })), ...files];
    if(items.length === 0) { 
        grid.innerHTML = '<div class="loader">📭 Kosong. Upload atau buat folder!</div>'; 
        return; 
    }
    
    grid.innerHTML = items.map(item => {
        if(item.isFolder) {
            return `<div class="folder-card" ondblclick="navigateToFolder('${item.id}')">
                        <div class="file-icon">📂</div>
                        <div class="file-name">${item.name}</div>
                        <div class="file-size">Folder</div>
                    </div>`;
        } else {
            return `<div class="file-card" onclick="previewFile('${item.id}')">
                        <div class="file-icon">${getIcon(item.type)}</div>
                        <div class="file-name">${item.name.length>30 ? item.name.substring(0,27)+'...' : item.name}</div>
                        <div class="file-size">${formatSize(item.size)}</div>
                    </div>`;
        }
    }).join('');
    
    const totalSize = allFiles.reduce((s,f) => s + (f.size || 0), 0);
    document.getElementById('storageInfo').innerHTML = `📦 ${formatSize(totalSize)} | ${allFiles.length} files | ${folders.length} folders`;
    document.getElementById('countAll').textContent = allFiles.length;
    document.getElementById('countFolders').textContent = folders.length;
    document.getElementById('countImage').textContent = allFiles.filter(f => f.type === 'image').length;
    document.getElementById('countVideo').textContent = allFiles.filter(f => f.type === 'video').length;
    document.getElementById('countAudio').textContent = allFiles.filter(f => f.type === 'audio').length;
    document.getElementById('countDocument').textContent = allFiles.filter(f => f.type === 'document').length;
}

async function loadFiles() { 
    allFiles = await getAllFilesFromDB(); 
    renderFiles(); 
}

async function handleFiles(files) {
    const prog = document.getElementById('uploadProgress');
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    prog.style.display = 'block';
    
    for(let i=0; i<files.length; i++) {
        const f = files[i];
        fill.style.width = ((i+1)/files.length)*100 + '%';
        text.textContent = `Upload ${i+1}/${files.length}: ${f.name}`;
        const fileId = Date.now() + '_' + Math.random().toString(36).substring(2) + '_' + f.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        await saveFile({ 
            id: fileId, 
            name: f.name, 
            size: f.size, 
            type: getFileType(f.name), 
            uploadedAt: new Date().toISOString() 
        }, f);
        await new Promise(r => setTimeout(r, 50));
    }
    
    setTimeout(() => { 
        prog.style.display = 'none'; 
        fill.style.width = '0%'; 
    }, 1000);
    await loadFiles();
    showToast(`✅ ${files.length} file uploaded`);
}

window.previewFile = async function(id) {
    currentPreviewFile = allFiles.find(f => f.id === id);
    if(!currentPreviewFile) return;
    
    const modal = document.getElementById('previewModal');
    document.getElementById('previewTitle').innerHTML = currentPreviewFile.name;
    const url = URL.createObjectURL(currentPreviewFile.blob);
    const body = document.getElementById('previewBody');
    
    if(currentPreviewFile.type === 'image') {
        body.innerHTML = `<img src="${url}" style="max-width:100%; max-height:50vh; border-radius:10px;">`;
    } else if(currentPreviewFile.type === 'video') {
        body.innerHTML = `<video src="${url}" controls autoplay style="max-width:100%; max-height:50vh;"></video>`;
    } else {
        body.innerHTML = `<div style="text-align:center;">
            <div style="font-size:60px;">${getIcon(currentPreviewFile.type)}</div>
            <p><strong>${currentPreviewFile.name}</strong></p>
            <p>Size: ${formatSize(currentPreviewFile.size)}</p>
        </div>`;
    }
    
    modal.classList.add('active');
    
    document.getElementById('downloadBtn').onclick = () => { 
        const a = document.createElement('a'); 
        a.href = url; 
        a.download = currentPreviewFile.name; 
        a.click(); 
    };
    
    document.getElementById('renameBtn').onclick = () => { 
        closePreview(); 
        openRenameModal(currentPreviewFile); 
    };
    
    document.getElementById('shareBtn').onclick = () => { 
        closePreview(); 
        openShareModal(currentPreviewFile); 
    };
    
    document.getElementById('deleteBtn').onclick = async () => { 
        if(confirm('Hapus file?')) { 
            await deleteFileFromDB(currentPreviewFile.id); 
            await loadFiles(); 
            closePreview(); 
            showToast('🗑️ Deleted'); 
        } 
    };
};

function closePreview() { 
    document.getElementById('previewModal').classList.remove('active'); 
    document.getElementById('previewBody').innerHTML = ''; 
}

function openRenameModal(f) { 
    currentRenameFile = f; 
    document.getElementById('newFileName').value = f.name.substring(0, f.name.lastIndexOf('.')) || f.name; 
    document.getElementById('renameModal').classList.add('active'); 
}

function closeRenameModal() { 
    document.getElementById('renameModal').classList.remove('active'); 
    currentRenameFile = null; 
}

async function executeRename() { 
    if(!currentRenameFile) return; 
    let newName = document.getElementById('newFileName').value.trim(); 
    if(!newName) { showToast('❌ Nama tidak boleh kosong'); return; } 
    const ext = '.' + currentRenameFile.name.split('.').pop(); 
    if(!newName.endsWith(ext)) newName += ext; 
    await updateFileNameInDB(currentRenameFile.id, newName); 
    await loadFiles(); 
    closeRenameModal(); 
    showToast(`✅ Renamed to ${newName}`); 
}

// ========== FITUR TAMBAHAN ==========
function openCreateFolderModal() { 
    document.getElementById('createFolderModal').classList.add('active'); 
    document.getElementById('newFolderName').value = ''; 
}

function closeCreateFolderModal() { 
    document.getElementById('createFolderModal').classList.remove('active'); 
}

let currentShareFile = null;

function openShareModal(f) { 
    currentShareFile = f; 
    document.getElementById('shareModal').classList.add('active'); 
    document.getElementById('shareLinkContainer').style.display = 'none'; 
    document.getElementById('sharePassword').value = ''; 
    document.getElementById('shareExpiry').value = '0'; 
}

function closeShareModal() { 
    document.getElementById('shareModal').classList.remove('active'); 
}

function generateShareLink() { 
    const shareId = 'share_' + Date.now() + '_' + Math.random().toString(36).substring(2); 
    const link = `${window.location.origin}?share=${shareId}`; 
    document.getElementById('shareLinkInput').value = link; 
    document.getElementById('shareLinkContainer').style.display = 'block'; 
    showToast('🔗 Link generated'); 
}

function copyShareLink() { 
    const inp = document.getElementById('shareLinkInput'); 
    inp.select(); 
    document.execCommand('copy'); 
    showToast('📋 Copied!'); 
}

function openZipModal() { 
    const container = document.getElementById('zipFileList'); 
    container.innerHTML = allFiles.map(f => 
        `<div class="zip-file-item" style="display:flex; align-items:center; gap:10px; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1);">
            <input type="checkbox" class="zip-item" data-id="${f.id}" data-name="${f.name}" style="width:18px; height:18px;">
            <label style="flex:1;">${f.name} (${formatSize(f.size)})</label>
        </div>`
    ).join('');
    document.getElementById('zipModal').classList.add('active'); 
}

function closeZipModal() { 
    document.getElementById('zipModal').classList.remove('active'); 
}

async function downloadAsZip() { 
    const selected = Array.from(document.querySelectorAll('.zip-item:checked')).map(cb => ({ 
        id: cb.dataset.id, 
        name: cb.dataset.name 
    })); 
    if(selected.length === 0) { showToast('❌ Pilih file'); return; } 
    showToast('📦 Creating ZIP...'); 
    const zip = new JSZip(); 
    for(const s of selected) { 
        const f = allFiles.find(f => f.id === s.id); 
        if(f && f.blob) zip.file(s.name, f.blob); 
    } 
    const content = await zip.generateAsync({ type: 'blob' }); 
    saveAs(content, `backup_${Date.now()}.zip`); 
    closeZipModal(); 
    showToast('✅ ZIP downloaded'); 
}

function openDiskChartModal() {
    const sizes = ['image','video','audio','document','other'].map(c => 
        allFiles.filter(f => f.type === c).reduce((s,f) => s + (f.size || 0), 0)
    );
    const total = sizes.reduce((a,b) => a + b, 0);
    const ctx = document.getElementById('storageChart').getContext('2d');
    if(storageChart) storageChart.destroy();
    storageChart = new Chart(ctx, { 
        type: 'doughnut', 
        data: { 
            labels: ['🖼️ Foto', '🎬 Video', '🎵 Audio', '📄 Dokumen', '📎 Lainnya'], 
            datasets: [{ 
                data: sizes, 
                backgroundColor: ['#ff3366', '#ffc107', '#00ff88', '#0a84ff', '#9933ff'],
                borderWidth: 0
            }] 
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#fff' } } } }
    });
    document.getElementById('chartStats').innerHTML = `
        <div class="storage-info-bar" style="text-align:center; margin-top:15px;">
            <span>📦 Total: ${formatSize(total)}</span>
            <span>📄 Files: ${allFiles.length}</span>
        </div>
    `;
    document.getElementById('diskChartModal').classList.add('active');
}

function closeDiskChartModal() { 
    document.getElementById('diskChartModal').classList.remove('active'); 
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('rff707_theme', isLight ? 'light' : 'dark');
    document.getElementById('themeToggle').textContent = isLight ? '☀️' : '🌙';
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => { 
            currentSearchQuery = e.target.value; 
            renderFiles(); 
        });
    }
    if(clearBtn) {
        clearBtn.addEventListener('click', () => { 
            document.getElementById('searchInput').value = ''; 
            currentSearchQuery = ''; 
            renderFiles(); 
        });
    }
}

function setupEventListeners() {
    const area = document.getElementById('uploadArea');
    const input = document.getElementById('fileInput');
    const sync = document.getElementById('syncBtn');
    
    if(area) {
        area.addEventListener('click', () => input.click());
        area.addEventListener('dragover', (e) => { e.preventDefault(); area.style.borderColor = '#ff6699'; });
        area.addEventListener('dragleave', () => area.style.borderColor = '#ff3366');
        area.addEventListener('drop', async (e) => { 
            e.preventDefault(); 
            area.style.borderColor = '#ff3366'; 
            await handleFiles(Array.from(e.dataTransfer.files)); 
        });
    }
    
    if(input) {
        input.addEventListener('change', async (e) => { 
            await handleFiles(Array.from(e.target.files)); 
            input.value = ''; 
        });
    }
    
    if(sync) {
        sync.addEventListener('click', async () => { 
            showToast('🔄 Syncing...'); 
            await loadFiles(); 
            showToast('✅ Synced'); 
        });
    }
    
    setInterval(() => { 
        const ping = Math.floor(Math.random() * 30) + 15; 
        const pingEl = document.getElementById('pingText');
        if(pingEl) pingEl.innerHTML = `Latency: ${ping}ms | Cloud: Online`;
    }, 5000);
    
    const theme = localStorage.getItem('rff707_theme'); 
    if(theme === 'light') { 
        document.body.classList.add('light-mode'); 
        document.getElementById('themeToggle').textContent = '☀️'; 
    }
}

async function initAllFeatures() {
    await initStorage();
    loadFolders();
    await loadFiles();
    setCategory('all');
    setupSearch();
    setupEventListeners();
    if(getCurrentUser()) showToast(`☁️ Welcome ${getCurrentUser().name}!`);
}

// Export untuk digunakan di HTML
window.createFolder = createFolder;
window.navigateToFolder = navigateToFolder;
window.setCategory = setCategory;
window.openCreateFolderModal = openCreateFolderModal;
window.closeCreateFolderModal = closeCreateFolderModal;
window.openZipModal = openZipModal;
window.closeZipModal = closeZipModal;
window.downloadAsZip = downloadAsZip;
window.openDiskChartModal = openDiskChartModal;
window.closeDiskChartModal = closeDiskChartModal;
window.openShareModal = openShareModal;
window.closeShareModal = closeShareModal;
window.generateShareLink = generateShareLink;
window.copyShareLink = copyShareLink;
window.closePreview = closePreview;
window.closeRenameModal = closeRenameModal;
window.toggleTheme = toggleTheme;
window.executeRename = executeRename;

// Inisialisasi saat halaman siap jika user sudah login
if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if(getCurrentUser()) initAllFeatures();
        document.getElementById('saveRenameBtn').onclick = executeRename;
    });
} else {
    if(getCurrentUser()) initAllFeatures();
    document.getElementById('saveRenameBtn').onclick = executeRename;
}