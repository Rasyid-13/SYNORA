import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js';
import { auth, db } from './firebase-config.js';
import { RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, arrayUnion, arrayRemove, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// KONFIGURASI SUPER ADMIN & WHATSAPP
const SUPER_ADMIN_CONTACT = "+6283161523142"; // Nomor HP Super Admin (Pakai +62)
const ADMIN_WA_NUMBER = "6283161523142"; // Nomor tujuan WA Admin (Tanpa +)

Alpine.data('synoraGate', () => ({
    appState: 'loading',
    userUid: null,
    userName: '',
    userContact: '',
    
    // Auth State
    authMode: 'phone', phoneNumber: '', otpSent: false, otpCode: '', email: '', password: '', confirmationResult: null,

    // Data Organisasi
    myOrganizations: [],
    isAdmin: false, 
    joinOrgId: '',

    // Etalase & Checkout State
    showCheckout: false,
    selectedTier: null,
    newOrgName: '',
    uniqueCode: 0,
    checkoutTotal: 0,
    
    // Promo State
    promoInput: '',
    promoMessage: '',
    promoValid: false,
    originalTotal: 0,
    discountAmount: 0,
    appliedPromoDoc: null,

    tiers: [
        { id: 'family', type: 'Family', name: 'Family Hub', tagline: 'Fondasi digital untuk keluarga Anda.', price: 0, period: 'Free forever', icon: '🏡', placeholder: 'Keluarga Cemara' },
        { id: 'campus', type: 'Campus', name: 'Campus & Community', tagline: 'Manajemen proker dan himpunan.', price: 99000, period: 'per 6 months', icon: '🎓', placeholder: 'BEM Fakultas Teknik' },
        { id: 'esports', type: 'Esports', name: 'E-Sports Team', tagline: 'Manajemen drafting & kompetitif.', price: 149000, period: 'per month', icon: '🎮', placeholder: 'Rex Regum Qeon' },
        { id: 'traders', type: 'Traders', name: 'Traders Hub', tagline: 'Jurnal trading & manajemen margin.', price: 199000, period: 'per month', icon: '📈', placeholder: 'Alpha Syndicate' },
        { id: 'business', type: 'Business', name: 'Business & SME', tagline: 'Sistem pencatatan audit korporat.', price: 299000, period: 'per month', icon: '🏢', placeholder: 'PT Maju Bersama' }
    ],

    init() {
        console.log('SYNORA Gate V2 Initialized');
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.userUid = user.uid;
                this.userContact = user.phoneNumber || user.email || "";
                await this.checkUser(user.uid, this.userContact);
            } else {
                this.appState = 'login';
                setTimeout(() => { this.setupRecaptcha(); }, 300);
            }
        });
    },

    // --- AUTHENTICATION ---
    setupRecaptcha() {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { 'size': 'normal' });
    },
    async sendOTP() {
        if (!this.phoneNumber) return alert("Masukkan nomor HP!");
        try {
            this.confirmationResult = await signInWithPhoneNumber(auth, this.phoneNumber, window.recaptchaVerifier);
            this.otpSent = true;
        } catch (error) { alert("GAGAL: " + error.message); }
    },
    async verifyOTP() {
        if (!this.otpCode) return;
        try { await this.confirmationResult.confirm(this.otpCode); } catch (error) { alert("OTP Salah!"); }
    },
    async loginWithEmail() {
        try { this.appState = 'loading'; await signInWithEmailAndPassword(auth, this.email, this.password); } 
        catch (e) { this.appState = 'login'; alert("Login Gagal!"); }
    },
    async registerWithEmail() {
        try { this.appState = 'loading'; await createUserWithEmailAndPassword(auth, this.email, this.password); } 
        catch (e) { this.appState = 'login'; alert("Daftar Gagal: " + e.message); }
    },
    async logout() {
        await signOut(auth); window.location.reload();
    },

    // --- LOAD USER DATA ---
    async checkUser(uid, contact) {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        this.isAdmin = (contact === SUPER_ADMIN_CONTACT);

        if (userSnap.exists()) {
            const data = userSnap.data();
            this.userName = data.name || "User";
            if (data.joined_organizations && data.joined_organizations.length > 0) {
                await this.loadOrganizations(data.joined_organizations);
            }
        } else {
            await setDoc(userRef, { uid: uid, contact: contact, name: "New User", joined_organizations: [], created_at: serverTimestamp() });
            this.userName = "New User";
        }
        
        // --- FITUR BARU: AUTO-REDIRECT KE ORG TERAKHIR ---
        const lastOrgStr = localStorage.getItem('synora_last_org');
        if (lastOrgStr) {
            try {
                const lastOrg = JSON.parse(lastOrgStr);
                // Pastikan dia masih member di org tersebut (belum dikick/bubar)
                if (this.myOrganizations.some(o => o.id === lastOrg.id)) {
                    // Langsung lempar ke dalam organisasi!
                    return this.enterOrganization(lastOrg.id, lastOrg.type); 
                } else {
                    localStorage.removeItem('synora_last_org');
                }
            } catch(e) {}
        }
        
        this.appState = 'main'; // Tampilkan gateway HANYA jika tidak di-redirect
    },

    // --- LOAD ORGANIZATIONS ---
    async loadOrganizations(orgIds) {
        this.myOrganizations = [];
        let validOrgIds = []; 
        
        for(let orgId of orgIds) {
            const snap = await getDoc(doc(db, "organizations", orgId));
            if(snap.exists()) {
                const data = snap.data();
                this.myOrganizations.push({ 
                    id: orgId, 
                    name: data.name, 
                    type: data.type || 'Family',
                    isHead: data.head_id === this.userUid 
                });
                validOrgIds.push(orgId);
            }
        }

        if (validOrgIds.length !== orgIds.length) {
            await updateDoc(doc(db, "users", this.userUid), { joined_organizations: validOrgIds });
        }
    },

    // --- FITUR JOIN ORGANISASI ---
    async joinOrg() {
        if (!this.joinOrgId.trim()) return alert("Masukkan ID Organisasi!");
        const inputId = this.joinOrgId.trim().toUpperCase(); 

        if (this.myOrganizations.some(o => o.id === inputId)) {
            return alert("Anda sudah berada di dalam organisasi ini.");
        }

        this.appState = 'loading';
        try {
            const orgRef = doc(db, "organizations", inputId);
            const orgSnap = await getDoc(orgRef);

            if (!orgSnap.exists()) {
                this.appState = 'main';
                return alert("Organisasi tidak ditemukan. Periksa kembali ID-nya.");
            }

            const batch = writeBatch(db);
            
            batch.update(doc(db, "users", this.userUid), {
                joined_organizations: arrayUnion(inputId)
            });

            batch.set(doc(db, "organizations", inputId, "members", this.userUid), {
                uid: this.userUid,
                name: this.userName,
                role_name: "Member", 
                joined_at: serverTimestamp(),
                permissions: { 
                    view_finance: true, edit_finance: false, manage_budget: false, 
                    manage_members: false, edit_permissions: false, 
                    view_notebook: true, edit_notebook: false 
                }
            });

            await batch.commit();
            
            this.joinOrgId = ''; 
            await this.checkUser(this.userUid, this.userContact); 
            alert("Berhasil bergabung!");
        } catch (e) {
            this.appState = 'main';
            alert("Terjadi kesalahan: " + e.message);
        }
    },

    // --- FITUR KELUAR ORGANISASI (ANGGOTA) ---
    async leaveOrg(orgId, orgName) {
        if (!confirm(`Apakah Anda yakin ingin KELUAR dari organisasi "${orgName}"?`)) return;

        this.appState = 'loading';
        try {
            const batch = writeBatch(db);
            batch.update(doc(db, "users", this.userUid), { joined_organizations: arrayRemove(orgId) });
            batch.delete(doc(db, "organizations", orgId, "members", this.userUid));

            await batch.commit();
            await this.checkUser(this.userUid, this.userContact); 
        } catch (e) {
            this.appState = 'main';
            alert("Gagal keluar: " + e.message);
        }
    },

    // --- FITUR BUBARKAN ORGANISASI (KETUA) ---
    async disbandOrg(orgId, orgName) {
        const text = prompt(`Peringatan Berbahaya!\nKetik "BUBAR" untuk menghapus "${orgName}" selamanya.`);
        if (text !== "BUBAR") {
            if (text !== null) alert("Kata sandi salah. Pembubaran dibatalkan.");
            return;
        }

        this.appState = 'loading';
        try {
            await deleteDoc(doc(db, "organizations", orgId));
            await updateDoc(doc(db, "users", this.userUid), { joined_organizations: arrayRemove(orgId) });
            await this.checkUser(this.userUid, this.userContact); 
            alert("Organisasi berhasil dibubarkan.");
        } catch (e) {
            this.appState = 'main';
            alert("Gagal membubarkan: " + e.message);
        }
    },

    // --- ROUTING (REDIRECT) ---
    async enterOrganization(orgId, type) {
        const orgSnap = await getDoc(doc(db, "organizations", orgId));
        if (orgSnap.exists()) {
            const orgData = orgSnap.data();
            
            if (orgData.status === 'locked') {
                return alert("Organisasi ini ditangguhkan oleh sistem. Harap hubungi Admin.");
            }
            if (orgData.expires_at) {
                const expDate = orgData.expires_at.toDate ? orgData.expires_at.toDate() : new Date(orgData.expires_at);
                if (new Date() > expDate) {
                    return alert("Masa aktif langganan organisasi ini telah habis. Harap hubungi Admin untuk perpanjangan.");
                }
            }
        }
        // ... (Kode pengecekan locked/expired biarkan saja) ...

        let targetFile = 'family-app.html';
        if (type === 'Family') targetFile = 'family-app.html';
        else if (type === 'Campus') targetFile = 'campus-app.html';
        else if (type === 'Esports') targetFile = 'esports-app.html';
        else if (type === 'Traders') targetFile = 'traders-app.html';
        else if (type === 'Business') targetFile = 'business-app.html';

        // --- FITUR BARU: SIMPAN MEMORI TERAKHIR DIBUKA ---
        localStorage.setItem('synora_last_org', JSON.stringify({ id: orgId, type: type }));

        window.location.href = `${targetFile}?orgId=${orgId}`;
    },

    // --- ETALASE & CHECKOUT ---
    selectTier(tier) {
        this.selectedTier = tier;
        this.newOrgName = '';
        
        this.promoInput = '';
        this.promoMessage = '';
        this.promoValid = false;
        this.discountAmount = 0;
        this.appliedPromoDoc = null;
        
        if (tier.price === 0) {
            this.showCheckout = true;
            this.checkoutTotal = 0;
            this.originalTotal = 0;
        } else {
            if (this.userContact === SUPER_ADMIN_CONTACT) {
                alert("👑 Welcome Super Admin! Bypass payment aktif.");
                this.checkoutTotal = 0; 
                this.originalTotal = 0;
                this.showCheckout = true;
                return;
            }
            
            this.uniqueCode = Math.floor(Math.random() * 900) + 100;
            this.originalTotal = tier.price + this.uniqueCode;
            this.checkoutTotal = this.originalTotal;
            this.showCheckout = true;
        }
    },

    async applyPromoCode() {
        if (!this.promoInput.trim()) return;
        const code = this.promoInput.trim().toUpperCase();
        
        try {
            const promoSnap = await getDoc(doc(db, "promo_codes", code));
            
            if (!promoSnap.exists()) {
                this.promoValid = false;
                this.promoMessage = "❌ Kode promo tidak ditemukan.";
                return;
            }
            
            const promo = promoSnap.data();
            
            if (promo.used >= promo.maxUsage) {
                this.promoValid = false;
                this.promoMessage = "❌ Yah, kuota penggunaan kode promo ini sudah habis.";
                return;
            }
            
            if (promo.expiresAt) {
                const expDate = promo.expiresAt.toDate ? promo.expiresAt.toDate() : new Date(promo.expiresAt);
                if (new Date() > expDate) {
                    this.promoValid = false;
                    this.promoMessage = "❌ Kode promo sudah melewati masa berlaku.";
                    return;
                }
            }
            
            this.promoValid = true;
            this.appliedPromoDoc = code;
            
            this.discountAmount = (this.selectedTier.price * promo.discount) / 100;
            this.checkoutTotal = (this.selectedTier.price - this.discountAmount) + this.uniqueCode;
            this.promoMessage = `✅ Berhasil! Diskon ${promo.discount}% diterapkan.`;
            
        } catch (e) {
            console.error("Error cek promo:", e);
        }
    },

    async confirmWhatsAppPayment() {
        if (!this.newOrgName.trim()) return alert("Masukkan nama organisasi!");

        // JIKA GRATIS ATAU ADMIN BYPASS (Langsung Buat)
        if (this.checkoutTotal === 0 && !this.appliedPromoDoc) {
            this.appState = 'loading';
            const orgId = "ORG-" + Math.random().toString(36).substring(2, 10).toUpperCase();
            const batch = writeBatch(db); 
            
            batch.set(doc(db, "organizations", orgId), { 
                org_id: orgId, type: this.selectedTier.type, name: this.newOrgName, head_id: this.userUid, created_at: serverTimestamp() 
            });
            batch.set(doc(db, "organizations", orgId, "members", this.userUid), {
                uid: this.userUid, role_name: "Head", name: this.userName, joined_at: serverTimestamp(), 
                permissions: { view_finance: true, edit_finance: true, manage_budget: true, manage_members: true, edit_permissions: true, view_notebook: true, edit_notebook: true }
            });
            
            const joined = this.myOrganizations.map(o => o.id);
            joined.push(orgId);
            batch.update(doc(db, "users", this.userUid), { joined_organizations: joined });

            await batch.commit();
            this.enterOrganization(orgId, this.selectedTier.type);
            return;
        }

        // JIKA BAYAR NORMAL & PROSES WA
        const reqId = "REQ-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        
        let promoText = '';
        if (this.appliedPromoDoc) {
            promoText = `- Kode Promo: *${this.appliedPromoDoc}* (-Rp ${this.discountAmount.toLocaleString('id-ID')})%0A`;
            
            try {
                await updateDoc(doc(db, "promo_codes", this.appliedPromoDoc), {
                    used: increment(1)
                });
            } catch (e) {
                console.error("Gagal update kuota promo:", e);
            }
        }

                const waMessage = `Halo Admin SYNORA, saya ingin konfirmasi pembayaran langganan aplikasi.%0A%0A` +
                          `*Detail Pesanan:*%0A` +
                          `- Paket: ${this.selectedTier.name}%0A` +
                          `- Nama Org: ${this.newOrgName}%0A` +
                          promoText +
                          `- UID: ${this.userUid}%0A` +  // <--- INI BARIS TAMBAHANNYA
                          `- Req ID: ${reqId}%0A` +
                          `- Total Bayar: *Rp ${this.checkoutTotal.toLocaleString('id-ID')}*%0A%0A` +
                          `Berikut bukti transfer saya:`;

        const waUrl = `https://wa.me/${ADMIN_WA_NUMBER}?text=${waMessage}`;
        window.open(waUrl, '_blank');
        
        this.showCheckout = false;
        alert("Terima kasih! Pesanan diproses. Admin akan menghubungi Anda untuk aktivasi.");
    }
}));

window.Alpine = Alpine;
Alpine.start();
