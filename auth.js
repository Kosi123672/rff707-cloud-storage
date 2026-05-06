// ========== GOOGLE AUTH CONFIG ==========
const AUTH_CONFIG = {
    googleClientId: "853304089350-0o21f2n1bfard60e6lakh69gls2dt9r0.apps.googleusercontent.com",
    storageKey: "rff707_current_user",
    usersListKey: "rff707_all_users"
};

let currentUser = null;

function decodeJWT(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(jsonPayload);
}

function saveUserToGlobalList(user) {
    let users = JSON.parse(localStorage.getItem(AUTH_CONFIG.usersListKey) || '[]');
    const existingIndex = users.findIndex(u => u.id === user.id);
    if(existingIndex !== -1) {
        users[existingIndex] = { ...users[existingIndex], ...user, lastActive: new Date().toISOString(), loginCount: (users[existingIndex].loginCount || 0) + 1 };
    } else {
        users.push({ ...user, firstLogin: new Date().toISOString(), loginCount: 1 });
    }
    localStorage.setItem(AUTH_CONFIG.usersListKey, JSON.stringify(users));
}

function getCurrentUser() { 
    return currentUser || JSON.parse(localStorage.getItem(AUTH_CONFIG.storageKey) || 'null'); 
}

function isLoggedIn() { 
    return getCurrentUser() !== null; 
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function updateUserUI() {
    const user = getCurrentUser();
    if(user) {
        const userInfoDiv = document.getElementById('userInfo');
        if(userInfoDiv) {
            userInfoDiv.innerHTML = `
                <div class="user-avatar">
                    <img src="${user.picture}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=ff3366&color=fff'">
                    <span style="font-size:13px;">${user.name.split(' ')[0]}</span>
                    <div class="user-dropdown" id="userDropdown">
                        <div class="user-dropdown-header">
                            <img src="${user.picture}">
                            <div>
                                <strong>${user.name}</strong><br>
                                <small>${user.email}</small>
                            </div>
                        </div>
                        <div class="user-dropdown-item" onclick="logout()">🚪 Logout</div>
                    </div>
                </div>
            `;
            
            const avatar = document.querySelector('.user-avatar');
            const dropdown = document.getElementById('userDropdown');
            if(avatar) {
                avatar.addEventListener('click', (e) => { 
                    e.stopPropagation(); 
                    dropdown.classList.toggle('show'); 
                });
            }
            document.addEventListener('click', () => dropdown.classList.remove('show'));
        }
        
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('storageContent').style.display = 'block';
        
        if(typeof initAllFeatures === 'function') {
            initAllFeatures();
        }
    }
}

function logout() {
    localStorage.removeItem(AUTH_CONFIG.storageKey);
    currentUser = null;
    document.getElementById('loginSection').style.display = 'flex';
    document.getElementById('storageContent').style.display = 'none';
    showToast('👋 Logout berhasil');
}

function handleGoogleCredentialResponse(response) {
    const userInfo = decodeJWT(response.credential);
    currentUser = {
        id: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        given_name: userInfo.given_name,
        loginTime: new Date().toISOString()
    };
    localStorage.setItem(AUTH_CONFIG.storageKey, JSON.stringify(currentUser));
    saveUserToGlobalList(currentUser);
    updateUserUI();
    showToast(`👋 Selamat datang, ${currentUser.name}!`);
}

function loadGoogleAPI() {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

async function initGoogleLogin() {
    await loadGoogleAPI();
    window.google.accounts.id.initialize({ 
        client_id: AUTH_CONFIG.googleClientId, 
        callback: handleGoogleCredentialResponse 
    });
    window.google.accounts.id.renderButton(
        document.getElementById('googleLoginBtn'), 
        { type: "standard", theme: "filled_black", size: "large", width: 300 }
    );
}

// Cek apakah sudah login sebelumnya
if(localStorage.getItem(AUTH_CONFIG.storageKey)) { 
    currentUser = JSON.parse(localStorage.getItem(AUTH_CONFIG.storageKey)); 
    updateUserUI(); 
}

// Inisialisasi Google Login
initGoogleLogin();
