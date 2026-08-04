import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js';
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, serverTimestamp, writeBatch, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Nomor kontak yang diizinkan masuk ke panel ini
const SUPER_ADMIN_CONTACT = "+6283161523142";

Alpine.data('adminPanel', () => ({
    appState: 'loading',
    activeTab: 'subscriptions',
    
    // Form Aktivasi Organisasi
    newOrg: { uid: '', name: '', type: 'Business', durationMonths: '1' },
    
    // Kelola Organisasi
    organizations: [],
    showRenewModal: false,
    selectedOrgForRenew: null,
    renewMonths: '1',

    // Kode Promo
    promoCodes: [],
    newPromo: { code: '', discount: '', maxUsage: '', expiresAt: '' },

    init() {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const contact = user.phoneNumber || user.email || "";
                if (contact === SUPER_ADMIN_CONTACT) {
                    await this.loadAdminData();
                    this.appState = 'main';
                } else {
                    alert("Akses Ditolak: Anda bukan Super Admin.");
                    window.location.href = 'index.html';
                }
            } else {
                window.location.href = 'index.html';
            }
        });
    },

    async loadAdminData() {
        await this.loadOrgs();
        await this.loadPromos();
    },

    // --- FITUR AKTIVASI ORGANISASI ---
    async createPremiumOrg() {
        if (!this.newOrg.uid || !this.newOrg.name) return alert("UID User dan Nama Organisasi wajib diisi!");
        
        try {
            const orgId = "ORG-" + Math.random().toString(36).substring(2, 10).toUpperCase();
            
            // Hitung tanggal kedaluwarsa (Expired Date)
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + parseInt(this.newOrg.durationMonths));

            const batch = writeBatch(db); 
            
            // 1. Buat Dokumen Organisasi Baru dengan batas waktu
            batch.set(doc(db, "organizations", orgId), { 
                org_id: orgId, 
                type: this.newOrg.type, 
                name: this.newOrg.name, 
                head_id: this.newOrg.uid, 
                created_at: serverTimestamp(),
                status: 'active', // Status aktif
                expires_at: expiryDate // Tanggal langganan habis
            });

            // 2. Masukkan User sebagai KETUA
            batch.set(doc(db, "organizations", orgId, "members", this.newOrg.uid), {
                uid: this.newOrg.uid, 
                role_name: "Head", 
                joined_at: serverTimestamp(), 
                permissions: { view_finance: true, edit_finance: true, manage_budget: true, manage_members: true, edit_permissions: true, view_notebook: true, edit_notebook: true }
            });

            // 3. Tambahkan ID Org ke profil User
            batch.update(doc(db, "users", this.newOrg.uid), { 
                joined_organizations: arrayUnion(orgId) 
            });

            await batch.commit();
            
            alert(`Berhasil! Organisasi ${this.newOrg.name} (${orgId}) telah dibuat dan aktif selama ${this.newOrg.durationMonths} bulan.`);
            this.newOrg = { uid: '', name: '', type: 'Business', durationMonths: '1' }; // Reset form
            this.loadOrgs(); // Segarkan daftar organisasi
            
        } catch (error) {
            alert("Gagal membuat organisasi: " + error.message);
        }
    },

    // --- KELOLA ORGANISASI & LOCKING ---
    async loadOrgs() {
        try {
            const snapshot = await getDocs(query(collection(db, "organizations")));
            this.organizations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
            console.error("Gagal memuat organisasi:", e);
        }
    },

    isLocked(expiresAt, status) {
        if (status === 'locked') return true;
        if (!expiresAt) return false; 
        
        const expDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
        return new Date() > expDate;
    },

    openRenewModal(org) {
        this.selectedOrgForRenew = org;
        this.showRenewModal = true;
    },

    async processRenew() {
        if (!this.selectedOrgForRenew) return;
        
        try {
            let currentExp = this.selectedOrgForRenew.expires_at;
            let newExpDate = currentExp && currentExp.toDate ? currentExp.toDate() : new Date();
            
            if (newExpDate < new Date()) {
                newExpDate = new Date(); 
            }
            
            newExpDate.setMonth(newExpDate.getMonth() + parseInt(this.renewMonths));

            await updateDoc(doc(db, "organizations", this.selectedOrgForRenew.id), {
                expires_at: newExpDate,
                status: 'active' 
            });
            
            alert("Perpanjangan berhasil!");
            this.showRenewModal = false;
            this.loadOrgs();
        } catch (e) {
            alert("Gagal memperpanjang: " + e.message);
        }
    },

    async toggleLock(org) {
        const currentLockState = this.isLocked(org.expires_at, org.status);
        const actionText = currentLockState ? "MEMBUKA KUNCI" : "MENGUNCI PAKSA";
        
        if(!confirm(`Yakin ingin ${actionText} organisasi ${org.name}?`)) return;

        try {
            await updateDoc(doc(db, "organizations", org.id), {
                status: currentLockState ? 'active' : 'locked'
            });
            alert(`Organisasi berhasil ${currentLockState ? 'dibuka' : 'dikunci'}.`);
            this.loadOrgs();
        } catch (e) {
            alert("Gagal merubah status: " + e.message);
        }
    },

    // --- KODE PROMO ---
    async loadPromos() {
        try {
            const snapshot = await getDocs(query(collection(db, "promo_codes")));
            this.promoCodes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
            console.error("Gagal memuat promo:", e);
        }
    },

    async createPromo() {
        if (!this.newPromo.code || !this.newPromo.discount) return alert("Kode dan Diskon wajib diisi!");
        
        try {
            const codeUpper = this.newPromo.code.trim().toUpperCase();
            
            let expiryDate = null;
            if (this.newPromo.expiresAt) {
                expiryDate = new Date(this.newPromo.expiresAt);
                // Atur jam ke pukul 23:59:59 agar berlaku penuh di hari tersebut
                expiryDate.setHours(23, 59, 59, 999);
            }

            await setDoc(doc(db, "promo_codes", codeUpper), {
                code: codeUpper,
                discount: parseInt(this.newPromo.discount),
                maxUsage: parseInt(this.newPromo.maxUsage) || 100,
                used: 0,
                expiresAt: expiryDate,
                created_at: serverTimestamp()
            });
            
            alert("Kode promo berhasil disimpan!");
            this.newPromo = { code: '', discount: '', maxUsage: '', expiresAt: '' };
            this.loadPromos();
        } catch (e) {
            alert("Gagal menyimpan promo: " + e.message);
        }
    },

    async deletePromo(id) {
        if(!confirm("Hapus kode promo ini?")) return;
        await deleteDoc(doc(db, "promo_codes", id));
        this.loadPromos();
    },

    isPromoExpired(expiresAt) {
        if (!expiresAt) return false;
        const expDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
        return new Date() > expDate;
    },

    // --- UTILITIES ---
    formatDate(ts) {
        if (!ts) return 'Selamanya';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    }
}));

window.Alpine = Alpine;
Alpine.start();
