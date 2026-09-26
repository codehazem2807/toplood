// ═══════════════════════════════════════════════════════════════
// 🗄️ Database Configuration — ملف مشترك لكل الصفحات
// ═══════════════════════════════════════════════════════════════
// ⚠️ مهم جداً: هذا الرقم يجب أن يكون متطابقاً في:
//    - index.html
//    - dashboard.html
//    - أي صفحة تستخدم IndexedDB
// ═══════════════════════════════════════════════════════════════

var DB_NAME = 'electronic_db';
var DB_VERSION = 5;  // 👈 الرقم الموحّد لكل الملفات

// ═══════════════════════════════════════════════════════════════
// 🧹 حذف قاعدة البيانات القديمة لو النسخة مختلفة
// ═══════════════════════════════════════════════════════════════
async function ensureDBVersion() {
    try {
        if (!indexedDB.databases) {
            // المتصفح لا يدعم indexedDB.databases() — نتجاهل
            return;
        }
        var dbs = await indexedDB.databases();
        var existing = dbs.find(function(d) { return d.name === DB_NAME; });
        
        if (existing && existing.version && existing.version > DB_VERSION) {
            console.warn('⚠️ قاعدة بيانات بنسخة أحدث (' + existing.version + 
                         ') — يتم الحذف لإعادة الإنشاء بنسخة ' + DB_VERSION);
            await deleteDatabase(DB_NAME);
        } else if (existing && existing.version && existing.version < DB_VERSION) {
            console.info('ℹ️ سيتم ترقية قاعدة البيانات من نسخة ' + 
                         existing.version + ' إلى ' + DB_VERSION);
        }
    } catch (e) {
        console.warn('تعذر فحص نسخة IndexedDB:', e);
    }
}

function deleteDatabase(name) {
    return new Promise(function(resolve) {
        try {
            var req = indexedDB.deleteDatabase(name);
            req.onsuccess = function() { 
                console.info('✅ تم حذف قاعدة البيانات القديمة');
                resolve(true); 
            };
            req.onerror = function() { 
                console.warn('❌ فشل حذف قاعدة البيانات');
                resolve(false); 
            };
            req.onblocked = function() { 
                console.warn('⏸️ حذف قاعدة البيانات محجوب — أغلق باقي التبويبات');
                setTimeout(function() { resolve(false); }, 500);
            };
        } catch (e) {
            resolve(false);
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// 📦 IndexedDB Wrapper موحّد
// ═══════════════════════════════════════════════════════════════
var dbInstance = null;
var dbPromise = null;

function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);
    if (dbPromise) return dbPromise;
    
    dbPromise = new Promise(function(resolve) {
        try {
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onupgradeneeded = function(event) {
                var db = event.target.result;
                
                if (!db.objectStoreNames.contains('accounts')) {
                    db.createObjectStore('accounts', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('outbox')) {
                    var store = db.createObjectStore('outbox', { 
                        keyPath: 'id', autoIncrement: true 
                    });
                    store.createIndex('status', 'status');
                }
                if (!db.objectStoreNames.contains('cache')) {
                    db.createObjectStore('cache', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
                // أضف أي stores أخرى تحتاجها هنا
            };
            
            request.onsuccess = function() {
                dbInstance = request.result;
                console.info('✅ IndexedDB opened — version ' + dbInstance.version);
                resolve(dbInstance);
            };
            
            request.onerror = function() {
                console.warn('❌ IndexedDB error:', request.error);
                resolve(null);
            };
            
            request.onblocked = function() {
                console.warn('⏸️ IndexedDB محجوب — أغلق التبويبات الأخرى');
                setTimeout(function() { resolve(null); }, 1000);
            };
        } catch (e) {
            console.warn('IndexedDB not available:', e);
            resolve(null);
        }
    });
    
    return dbPromise;
}

async function dbPut(storeName, data) {
    var db = await openDB();
    if (!db || !db.objectStoreNames.contains(storeName)) return null;
    return new Promise(function(resolve) {
        try {
            var tx = db.transaction(storeName, 'readwrite');
            var store = tx.objectStore(storeName);
            var request = store.put(data);
            request.onsuccess = function() { resolve(request.result); };
            request.onerror = function() { resolve(null); };
        } catch (e) { resolve(null); }
    });
}

async function dbGet(storeName, key) {
    var db = await openDB();
    if (!db || !db.objectStoreNames.contains(storeName)) return null;
    return new Promise(function(resolve) {
        try {
            var tx = db.transaction(storeName, 'readonly');
            var store = tx.objectStore(storeName);
            var request = store.get(key);
            request.onsuccess = function() { resolve(request.result); };
            request.onerror = function() { resolve(null); };
        } catch (e) { resolve(null); }
    });
}

async function dbGetAll(storeName) {
    var db = await openDB();
    if (!db || !db.objectStoreNames.contains(storeName)) return [];
    return new Promise(function(resolve) {
        try {
            var tx = db.transaction(storeName, 'readonly');
            var store = tx.objectStore(storeName);
            var request = store.getAll();
            request.onsuccess = function() { resolve(request.result || []); };
            request.onerror = function() { resolve([]); };
        } catch (e) { resolve([]); }
    });
}

async function dbDelete(storeName, key) {
    var db = await openDB();
    if (!db || !db.objectStoreNames.contains(storeName)) return false;
    return new Promise(function(resolve) {
        try {
            var tx = db.transaction(storeName, 'readwrite');
            var store = tx.objectStore(storeName);
            var request = store.delete(key);
            request.onsuccess = function() { resolve(true); };
            request.onerror = function() { resolve(false); };
        } catch (e) { resolve(false); }
    });
}

async function dbClear(storeName) {
    var db = await openDB();
    if (!db || !db.objectStoreNames.contains(storeName)) return false;
    return new Promise(function(resolve) {
        try {
            var tx = db.transaction(storeName, 'readwrite');
            var store = tx.objectStore(storeName);
            var request = store.clear();
            request.onsuccess = function() { resolve(true); };
            request.onerror = function() { resolve(false); };
        } catch (e) { resolve(false); }
    });
}

// ═══════════════════════════════════════════════════════════════
// 🌐 Export للاستخدام العام
// ═══════════════════════════════════════════════════════════════
window.ElectronicDB = {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    ensureDBVersion: ensureDBVersion,
    deleteDatabase: deleteDatabase,
    openDB: openDB,
    put: dbPut,
    get: dbGet,
    getAll: dbGetAll,
    delete: dbDelete,
    clear: dbClear
};
