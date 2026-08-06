import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js';
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

Alpine.data('campusApp', () => ({
    appState: 'loading',
    userUid: null,
    userName: '',
    userContact: '',
    userRole: '',    
    userDivisi: '',  

    activeOrg: { id: '', name: '', type: '' },
    copied: false,
    
    perms: { 
        bph: false,             
        manage_info: false,     
        manage_finance: false,  
        manage_divisi: false    
    },

    activeTab: 'home',
    showMenu: false,
    prokerFilter: 'all',
    financeFilter: 'Bulanan',

    showNotulensiModal: false,
    notulensiMode: 'list',
    notesList: [],
    selectedNote: null,
    noteForm: { id: null, title: '', date: '', content: '' },
    
    announcements: [],
    showAnnounceModal: false,
    announceForm: { title: '', content: '' },

    showOrgSettingsModal: false,
    orgSettingsForm: { name: '' },
    
    // State Proker (Nav 2)
    prokersList: [],
    showProkerFormModal: false,
    showProkerDetailModal: false,
    prokerForm: { id: null, title: '', description: '', division: '', deadline: '', status: 'Planning', progress: 0 },
    selectedProker: null,
    selectedProkerUpdate: { status: 'Planning', progress: 0 },
    
    // VARIABEL FILTER BARU
    prokerSort: 'asc', 
    showArchivedProker: false, 

    get filteredProkers() {
        let result = this.prokersList;
        
        if (this.prokerFilter === 'my_division') {
            result = result.filter(p => p.division.toLowerCase() === this.userDivisi.toLowerCase());
        }

        result = result.filter(p => {
            if (this.showArchivedProker) {
                return p.status === 'Completed'; 
            } else {
                return p.status !== 'Completed'; 
            }
        });

        result.sort((a, b) => {
            let dateA = new Date(a.deadline).getTime() || 0;
            let dateB = new Date(b.deadline).getTime() || 0;
            return this.prokerSort === 'asc' ? dateA - dateB : dateB - dateA;
        });

        return result;
    },

    // State Keuangan (Nav 3)
    financeList: [],
    showTxFormModal: false,
    showTxDetailModal: false,
    txForm: { type: 'in', title: '', items: [{ desc: '', amount: '' }] },
    selectedTx: null,

    get totalKas() {
        return this.financeList.reduce((acc, tx) => tx.type === 'in' ? acc + Number(tx.total) : acc - Number(tx.total), 0);
    },

    get filteredFinanceList() {
        const now = new Date();
        return this.financeList.filter(tx => {
            if (!tx.date) return true;
            const txDate = new Date(tx.date);
            if (this.financeFilter === 'Mingguan') {
                return Math.abs(now - txDate) / (1000 * 60 * 60 * 24) <= 7;
            } else if (this.financeFilter === 'Bulanan') {
                return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
            } else if (this.financeFilter === 'Tahunan') {
                return txDate.getFullYear() === now.getFullYear();
            }
            return true;
        });
    },

    get filteredTotalIn() {
        return this.filteredFinanceList.filter(tx => tx.type === 'in').reduce((acc, tx) => acc + Number(tx.total), 0);
    },

    get filteredTotalOut() {
        return this.filteredFinanceList.filter(tx => tx.type === 'out').reduce((acc, tx) => acc + Number(tx.total), 0);
    },

    get txFormTotal() {
        return this.txForm.items.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
    },

    // State SDM (Nav 4)
    allMembers: [], 
    bphMembers: [], 
    divisionsList: [], 
    
    showProfileModal: false,
    profileForm: { name: '' },
    
    showManageBphModal: false,
    bphAssignments: { 'Wakil Ketua': '', 'Sekretaris': '', 'Bendahara': '' },
    
    showAddDivisionModal: false,
    newDivisionName: '',
    
    showDivisionDetailModal: false,
    selectedDivision: null, 
    selectedDivisionUpdate: { headUid: '' },
    selectedDivisionMembers: [], 
    showAddMemberToDiv: false,
    newMemberForDivUid: '',

    // Computed Getters untuk Dropdown Pilihan Anggota
    get availableMembersForDivision() {
         return this.allMembers.filter(m => m.role_name === 'Anggota' || m.role_name === 'Kepala Divisi');
    },

    get membersWithoutDivision() {
        return this.allMembers.filter(m => m.role_name === 'Anggota' && (!m.divisi || m.divisi === ''));
    },

    init() {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.userUid = user.uid;
                await this.loadUserAndOrg();
            } else {
                window.location.href = 'index.html';
            }
        });
    },

    async loadUserAndOrg() {
        const urlParams = new URLSearchParams(window.location.search);
        const orgId = urlParams.get('orgId');
        if (!orgId) return window.location.href = 'index.html';

        const userSnap = await getDoc(doc(db, "users", this.userUid));
        if (userSnap.exists()) {
            this.userName = userSnap.data().name;
            this.userContact = userSnap.data().contact || ''; // <--- Ambil data kontak
        }

        const orgSnap = await getDoc(doc(db, "organizations", orgId));
        if (orgSnap.exists()) {
            this.activeOrg = orgSnap.data();
            this.activeOrg.id = orgId;
        }

        const memberSnap = await getDoc(doc(db, "organizations", orgId, "members", this.userUid));
        if (memberSnap.exists()) {
            const m = memberSnap.data();
            this.userRole = m.role_name === 'Head' ? 'Ketua' : (m.role_name || 'Anggota');
            this.userDivisi = m.divisi || '';

            const r = this.userRole;
            if (r === 'Ketua' || r === 'Wakil Ketua') {
                this.perms.bph = this.perms.manage_info = this.perms.manage_finance = this.perms.manage_divisi = true;
            } else if (r === 'Sekretaris') {
                this.perms.manage_info = true; 
            } else if (r === 'Bendahara') {
                this.perms.manage_finance = true;
            } else if (r === 'Kepala Divisi') {
                this.perms.manage_divisi = true;
            }
        }
        
        this.listenToNotulensi(orgId);
        this.listenToAnnouncements(orgId);
        this.listenToProkers(orgId);
        this.listenToFinance(orgId);
        
        // TAMBAHKAN INI:
        this.listenToMembers(orgId);
        this.listenToDivisions(orgId);
        
        this.appState = 'main';
    },

    switchTab(tab) { this.activeTab = tab; this.showMenu = false; },
    switchOrg() { localStorage.removeItem('synora_last_org'); window.location.href='index.html'; },

    listenToNotulensi(orgId) {
        onSnapshot(query(collection(db, "organizations", orgId, "notulensi"), orderBy("created_at", "desc")), (snap) => {
            this.notesList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
    },
    async saveNotulensi() {
        if (!this.noteForm.title) return alert("Judul wajib diisi!");
        const payload = { title: this.noteForm.title, content: this.noteForm.content, author_name: this.userName, date: new Date().toISOString(), created_at: serverTimestamp() };
        this.noteForm.id ? await updateDoc(doc(db, "organizations", this.activeOrg.id, "notulensi", this.noteForm.id), payload) : await addDoc(collection(db, "organizations", this.activeOrg.id, "notulensi"), payload);
        this.notulensiMode = 'list';
    },

    listenToAnnouncements(orgId) {
        onSnapshot(query(collection(db, "organizations", orgId, "announcements"), orderBy("created_at", "desc")), (snap) => {
            this.announcements = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
    },
    async saveAnnouncement() {
        if (!this.announceForm.title) return;
        await addDoc(collection(db, "organizations", this.activeOrg.id, "announcements"), { title: this.announceForm.title, content: this.announceForm.content, author_name: this.userName, created_at: serverTimestamp() });
        this.showAnnounceModal = false; this.announceForm = { title: '', content: '' };
    },
    async deleteAnnouncement(annId) { if(confirm("Hapus?")) await deleteDoc(doc(db, "organizations", this.activeOrg.id, "announcements", annId)); },

    listenToProkers(orgId) {
        onSnapshot(query(collection(db, "organizations", orgId, "prokers"), orderBy("created_at", "desc")), (snap) => {
            this.prokersList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
    },
    openAddProker() { this.prokerForm = { id: null, title: '', description: '', division: '', deadline: '', status: 'Planning', progress: 0 }; this.showProkerFormModal = true; },
    async saveProker() {
        await addDoc(collection(db, "organizations", this.activeOrg.id, "prokers"), { ...this.prokerForm, progress: 0, created_by: this.userName, created_at: serverTimestamp() });
        this.showProkerFormModal = false;
    },
    openProkerDetail(p) { this.selectedProker = p; this.selectedProkerUpdate = { status: p.status, progress: p.progress }; this.showProkerDetailModal = true; },
    async updateProkerData() {
        await updateDoc(doc(db, "organizations", this.activeOrg.id, "prokers", this.selectedProker.id), { status: this.selectedProkerUpdate.status, progress: parseInt(this.selectedProkerUpdate.progress) });
        this.showProkerDetailModal = false;
    },
    async deleteProker(pId) { if(confirm("Hapus?")) { await deleteDoc(doc(db, "organizations", this.activeOrg.id, "prokers", pId)); this.showProkerDetailModal = false; } },
    getStatusStyle(status) { return status === 'On-Going' ? 'bg-blue-100 text-blue-700' : status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'; },

    listenToFinance(orgId) {
        onSnapshot(query(collection(db, "organizations", orgId, "finance"), orderBy("date", "desc")), (snap) => {
            this.financeList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
    },
    openTxForm() { this.txForm = { type: 'in', title: '', items: [{ desc: '', amount: '' }] }; this.showTxFormModal = true; },
    addTxItem() { this.txForm.items.push({ desc: '', amount: '' }); },
    removeTxItem(i) { if(this.txForm.items.length > 1) this.txForm.items.splice(i, 1); },
    async saveTransaction() {
        const validItems = this.txForm.items.filter(i => i.desc.trim() !== '' && Number(i.amount) > 0);
        if(validItems.length === 0 || this.txFormTotal <= 0) return alert("Rincian kosong!");
        await addDoc(collection(db, "organizations", this.activeOrg.id, "finance"), { type: this.txForm.type, title: this.txForm.title, items: validItems, total: this.txFormTotal, author_name: this.userName, date: new Date().toISOString(), created_at: serverTimestamp() });
        this.showTxFormModal = false;
    },
    openTxDetail(tx) { this.selectedTx = tx; this.showTxDetailModal = true; },
    async deleteTransaction(txId) { if(confirm("Hapus?")) { await deleteDoc(doc(db, "organizations", this.activeOrg.id, "finance", txId)); this.showTxDetailModal = false; } },

    // ==========================================
    // SISTEM SDM & STRUKTUR MUTLAK (NAV 4)
    // ==========================================
    listenToMembers(orgId) {
        onSnapshot(query(collection(db, "organizations", orgId, "members")), (snap) => {
            this.allMembers = [];
            this.bphMembers = [];
            
            snap.forEach((docSnap) => {
                const member = { uid: docSnap.id, ...docSnap.data() };
                this.allMembers.push(member);
                if (['Ketua', 'Wakil Ketua', 'Sekretaris', 'Bendahara', 'Head'].includes(member.role_name)) {
                    // Normalisasi label Head jadi Ketua untuk tampilan
                    if (member.role_name === 'Head') member.role_name = 'Ketua';
                    this.bphMembers.push(member);
                }
            });
            
            if (this.selectedDivision) this.refreshDivisionMembers();
        });
    },

    listenToDivisions(orgId) {
        onSnapshot(query(collection(db, "organizations", orgId, "divisions")), (snap) => {
            this.divisionsList = [];
            snap.forEach((docSnap) => {
                this.divisionsList.push({ name: docSnap.id, ...docSnap.data() });
            });
            
             if (this.selectedDivision) {
                 const updated = this.divisionsList.find(d => d.name === this.selectedDivision.name);
                 if(updated) {
                     this.selectedDivision = updated;
                     this.selectedDivisionUpdate.headUid = updated.headUid || '';
                 }
             }
        });
    },

    // --- Profil ---
    openProfileModal() {
        this.profileForm.name = this.userName;
        this.profileForm.contact = this.userContact;
        this.profileForm.password = ''; // Selalu kosongkan form password saat dibuka demi keamanan
        this.showProfileModal = true;
    },

    async saveProfile() {
        try {
            // 1. Update data biasa di Firestore
            await updateDoc(doc(db, "users", this.userUid), { 
                name: this.profileForm.name,
                contact: this.profileForm.contact
            });
            // Update nama di koleksi member organisasi agar sinkron
            await updateDoc(doc(db, "organizations", this.activeOrg.id, "members", this.userUid), { 
                name: this.profileForm.name 
            });
            
            this.userName = this.profileForm.name;
            this.userContact = this.profileForm.contact;

            // 2. Jika user mengetik password baru, update ke Firebase Auth
            if (this.profileForm.password.trim() !== '') {
                try {
                    await updatePassword(auth.currentUser, this.profileForm.password);
                    alert("Profil dan Password berhasil diperbarui!");
                } catch(err) {
                    alert("Profil tersimpan, TAPI password gagal diubah: Sesi login sudah usang. Silakan logout dan login ulang jika ingin mengubah password.");
                }
            } else {
                alert("Profil berhasil diperbarui!");
            }

            this.showProfileModal = false;
        } catch(e) { 
            alert("Gagal update profil: " + e.message); 
        }
    },

    // --- Kelola BPH ---
    openManageBphModal() {
        // Siapkan ruang slot kosong
        this.bphAssignments = { 'Wakil Ketua': [''], 'Sekretaris': ['', ''], 'Bendahara': ['', ''] };
        
        let secCount = 0;
        let benCount = 0;
        
        // Baca BPH yang saat ini menjabat untuk ditampilkan di form
        this.bphMembers.forEach(m => {
            if (m.role_name === 'Wakil Ketua') {
                this.bphAssignments['Wakil Ketua'][0] = m.uid;
            } else if (m.role_name === 'Sekretaris' && secCount < 2) {
                this.bphAssignments['Sekretaris'][secCount] = m.uid;
                secCount++;
            } else if (m.role_name === 'Bendahara' && benCount < 2) {
                this.bphAssignments['Bendahara'][benCount] = m.uid;
                benCount++;
            }
        });
        
        this.showManageBphModal = true;
    },
    async saveBphRoles() {
        if (!this.perms.bph) return;
        try {
            // 1. Reset BPH lama (Turunkan mereka jadi Anggota biasa)
            for (let m of this.bphMembers) {
                if (m.role_name !== 'Ketua' && m.role_name !== 'Head') {
                    await updateDoc(doc(db, "organizations", this.activeOrg.id, "members", m.uid), { role_name: 'Anggota' });
                }
            }
            
            // 2. Set BPH baru (Loop ganda untuk membaca array 2 slot)
            for (const [role, uids] of Object.entries(this.bphAssignments)) {
                for (const uid of uids) {
                    if (uid) { // Hanya eksekusi jika dropdown dipilih (tidak dikosongkan)
                        await updateDoc(doc(db, "organizations", this.activeOrg.id, "members", uid), { role_name: role, divisi: '' });
                    }
                }
            }
            
            this.showManageBphModal = false;
            alert("Formasi BPH berhasil diperbarui!");
        } catch(e) { 
            alert("Gagal update formasi: " + e.message); 
        }
    },

    // --- Kelola Divisi ---
    openAddDivisionModal() { this.newDivisionName = ''; this.showAddDivisionModal = true; },
    async saveNewDivision() {
        if (!this.perms.bph || !this.newDivisionName.trim()) return;
        try {
            await setDoc(doc(db, "organizations", this.activeOrg.id, "divisions", this.newDivisionName.trim()), {
                headUid: '', headName: '', memberCount: 0, created_at: serverTimestamp()
            });
            this.showAddDivisionModal = false;
        } catch(e) { alert("Gagal buat divisi."); }
    },

    openDivisionDetail(div) {
        this.selectedDivision = div;
        this.selectedDivisionUpdate.headUid = div.headUid || '';
        this.showAddMemberToDiv = false; this.newMemberForDivUid = '';
        this.refreshDivisionMembers();
        this.showDivisionDetailModal = true;
    },

    refreshDivisionMembers() {
        this.selectedDivisionMembers = this.allMembers.filter(m => m.divisi === this.selectedDivision.name && m.role_name !== 'Kepala Divisi');
    },

    async setDivisionHead() {
        if (!this.perms.bph) return;
        const newHeadUid = this.selectedDivisionUpdate.headUid;
        try {
            if (this.selectedDivision.headUid) {
                await updateDoc(doc(db, "organizations", this.activeOrg.id, "members", this.selectedDivision.headUid), { role_name: 'Anggota' });
            }
            
            let headName = '';
            if (newHeadUid) {
                const mObj = this.allMembers.find(m => m.uid === newHeadUid);
                headName = mObj ? mObj.name : '';
                await updateDoc(doc(db, "organizations", this.activeOrg.id, "members", newHeadUid), { role_name: 'Kepala Divisi', divisi: this.selectedDivision.name });
            }
            await updateDoc(doc(db, "organizations", this.activeOrg.id, "divisions", this.selectedDivision.name), { headUid: newHeadUid, headName: headName });
        } catch(e) { alert("Gagal set Kadiv."); }
    },

    async addMemberToDivision() {
        if (!this.newMemberForDivUid) return;
        try {
            await updateDoc(doc(db, "organizations", this.activeOrg.id, "members", this.newMemberForDivUid), { divisi: this.selectedDivision.name });
            await updateDoc(doc(db, "organizations", this.activeOrg.id, "divisions", this.selectedDivision.name), { memberCount: (this.selectedDivision.memberCount || 0) + 1 });
            this.newMemberForDivUid = ''; this.showAddMemberToDiv = false;
        } catch(e) { alert("Gagal."); }
    },

    async removeMemberFromDivision(uid) {
        if (!confirm("Keluarkan?")) return;
        try {
            await updateDoc(doc(db, "organizations", this.activeOrg.id, "members", uid), { divisi: '' });
            await updateDoc(doc(db, "organizations", this.activeOrg.id, "divisions", this.selectedDivision.name), { memberCount: Math.max(0, (this.selectedDivision.memberCount || 0) - 1) });
        } catch(e) { alert("Gagal keluarkan."); }
    },

    async deleteDivision(divName) {
        if (!this.perms.bph || !confirm("Hapus divisi selamanya?")) return;
        try {
            const membersInDiv = this.allMembers.filter(m => m.divisi === divName);
            for (let m of membersInDiv) {
                await updateDoc(doc(db, "organizations", this.activeOrg.id, "members", m.uid), { divisi: '', role_name: m.role_name === 'Kepala Divisi' ? 'Anggota' : m.role_name });
            }
            await deleteDoc(doc(db, "organizations", this.activeOrg.id, "divisions", divName));
            this.showDivisionDetailModal = false;
        } catch(e) { alert("Gagal hapus."); }
    },
    // Fitur Salin ID Organisasi
    copyOrgId() {
        const idToCopy = this.activeOrg.id;
        
        // Cek dukungan clipboard API modern
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(idToCopy);
        } else {
            // Fallback untuk browser lawas / HP lama
            let textArea = document.createElement("textarea");
            textArea.value = idToCopy;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
            } catch (err) {
                console.error("Gagal menyalin ID", err);
            }
            textArea.remove();
        }
        
        // Ubah teks tombol jadi "Tersalin" selama 2 detik
        this.copied = true;
        setTimeout(() => {
            this.copied = false;
        }, 2000);
    },

    formatRupiah(angka) { return angka ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka) : "Rp 0"; },
    
    openOrgSettings() { this.orgSettingsForm.name = this.activeOrg.name; this.showOrgSettingsModal = true; },
    async saveOrgSettings() { await updateDoc(doc(db, "organizations", this.activeOrg.id), { name: this.orgSettingsForm.name }); this.activeOrg.name = this.orgSettingsForm.name; this.showOrgSettingsModal = false; },
    formatDate(dateVal) { return dateVal ? (dateVal.toDate ? dateVal.toDate() : new Date(dateVal)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
}));

window.Alpine = Alpine;
Alpine.start();
